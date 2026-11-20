import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_BRAND_WHERE } from '../../../shared/database/active-business.where.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import {
  isPhoneSearchable,
  phoneSearchPatterns,
} from '../../../shared/phone/phone-search-patterns.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { CLIENT_AUDIT_FIELDS } from '../../audit/fields/client.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { ClientSearchRequestDto } from '../dto/client-search-request.dto.js';
import { CreateClientDto } from '../dto/create-client.dto.js';
import { SetClientBanDto } from '../dto/set-client-ban.dto.js';
import { UpdateClientDto } from '../dto/update-client.dto.js';
import { ClientSearchOrderBy } from '../enums/client-search-order-by.enum.js';
import { ClientImportRow } from '../import/interfaces/client-import-row.interface.js';
import { AcquisitionSourceCount } from '../interfaces/acquisition-source-count.interface.js';
import { ClientAcquisition } from '../interfaces/client-acquisition.interface.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { editTrafficSource } from '../../../shared/traffic/rules/traffic-source-edit.rules.js';

const PHONE_LOOKUP_CHUNK = 500;
const IMPORT_INSERT_CHUNK = 200;

@Injectable()
export class ClientsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    brandId: string,
    dto: CreateClientDto,
    actor: AuditActor,
  ): Promise<Client> {
    let client: Client;
    try {
      client = await this.db.client.create({
        data: {
          brandId,
          ...this.buildClientFields(dto),
          ...this.acquisitionSourceWrite(null, dto),
        },
      });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(
          ErrorCode.CLIENT_PHONE_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
    this.emitCreated(brandId, client, actor);
    return client;
  }

  async update(
    brandId: string,
    clientId: string,
    dto: UpdateClientDto,
    actor: AuditActor,
  ): Promise<Client> {
    const old = await this.findInBrand(brandId, clientId);
    let client: Client;
    try {
      client = await this.db.client.update({
        where: { id: clientId },
        data: {
          ...this.buildClientFields(dto),
          ...this.acquisitionSourceWrite(old, dto),
        },
      });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(
          ErrorCode.CLIENT_PHONE_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
    const changes = diffFields(old, client, CLIENT_AUDIT_FIELDS);
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        brandId,
        entityType: AuditEntity.CLIENT,
        entityId: clientId,
        eventType: AuditEvent.CLIENT_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return client;
  }

  async setBan(
    brandId: string,
    clientId: string,
    dto: SetClientBanDto,
    actor: AuditActor,
  ): Promise<void> {
    const old = await this.findInBrand(brandId, clientId);
    const banReason = dto.banned ? (dto.reason ?? '').trim() : null;
    if (dto.banned && !banReason) {
      throw new AppException(ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST);
    }

    const now = new Date();
    const bannedAt = dto.banned ? (old.bannedAt ?? now) : null;
    if ((old.bannedAt !== null) === dto.banned && old.banReason === banReason) {
      throw new AppException(
        ErrorCode.CLIENT_BAN_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    }

    const client = await this.db.client.update({
      where: { id: clientId },
      data: { bannedAt, banReason },
    });
    const changes = diffFields(old, client, CLIENT_AUDIT_FIELDS);
    if (changes.length === 0) return;

    const event: AuditLogEvent = {
      brandId,
      entityType: AuditEntity.CLIENT,
      entityId: clientId,
      eventType: AuditEvent.CLIENT_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: now,
      actor,
      payload: { changes },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async findById(clientId: string): Promise<Client> {
    const client = await this.db.client.findUnique({
      where: { brand: ACTIVE_BRAND_WHERE, id: clientId },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async findInBrand(brandId: string, clientId: string): Promise<Client> {
    const client = await this.db.client.findFirst({
      where: { brand: ACTIVE_BRAND_WHERE, id: clientId, brandId },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async resolveForBooking(
    brandId: string,
    phone: string,
    firstName: string,
    lastName: string,
    email?: string,
  ): Promise<Client> {
    const where = { brandId_phone: { brandId, phone } };
    try {
      return await this.db.client.upsert({
        where,
        update: {},
        create: { brandId, firstName, lastName, phone, email: email ?? null },
      });
    } catch (e: unknown) {
      // Two first bookings by a new phone at once: the one that lost the insert reads the winner.
      if (
        (e as { code?: string } | null)?.code !==
        PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      )
        throw e;
      return this.db.client.findUniqueOrThrow({ where });
    }
  }

  async search(
    brandId: string,
    dto: ClientSearchRequestDto,
  ): Promise<PaginatedResult<Client>> {
    const where: Prisma.ClientWhereInput = {
      brand: ACTIVE_BRAND_WHERE,
      brandId,
    };
    const search = dto.search?.trim();
    if (search) where.OR = this.searchConditions(search);
    if (dto.banned === true) where.bannedAt = { not: null };
    else if (dto.banned === false) where.bannedAt = null;
    if (dto.acquisitionSources?.length)
      where.acquisitionSource = { in: dto.acquisitionSources };

    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = stableOrderBy<Prisma.ClientOrderByWithRelationInput>(
      { [dto.orderBy ?? ClientSearchOrderBy.CREATED_AT]: direction },
      direction,
    );
    const skip = dto.isExport ? 0 : (dto.page - 1) * dto.pageSize;
    const take = dto.isExport ? undefined : dto.pageSize;

    if (!dto.phone) {
      const [items, totalItems] = await this.db.$transaction([
        this.db.client.findMany({ where, orderBy, skip, take }),
        this.db.client.count({ where }),
      ]);
      return { items, totalItems };
    }

    // Numbers that start with the typed digits rank first; each group keeps the requested order.
    const patterns = phoneSearchPatterns(dto.phone);
    const startsWithTyped: Prisma.ClientWhereInput = {
      OR: patterns.rankPrefixes.map((prefix) => ({
        phone: { startsWith: prefix },
      })),
    };
    const first: Prisma.ClientWhereInput = { AND: [where, startsWithTyped] };
    const rest: Prisma.ClientWhereInput = {
      AND: [
        where,
        { OR: this.phoneConditions(dto.phone) },
        { NOT: startsWithTyped },
      ],
    };
    const [firstCount, restCount] = await this.db.$transaction([
      this.db.client.count({ where: first }),
      this.db.client.count({ where: rest }),
    ]);
    // The page window [skip, skip + take) runs over the first group, then the rest.
    const firstLeft = Math.max(0, firstCount - skip);
    const firstTake =
      take === undefined ? undefined : Math.min(take, firstLeft);
    const restTake =
      take === undefined ? undefined : take - Math.min(take, firstLeft);
    const [firstItems, restItems] = await Promise.all([
      firstLeft === 0
        ? []
        : this.db.client.findMany({
            where: first,
            orderBy,
            skip,
            take: firstTake,
          }),
      restTake === 0
        ? []
        : this.db.client.findMany({
            where: rest,
            orderBy,
            skip: Math.max(0, skip - firstCount),
            take: restTake,
          }),
    ]);
    return {
      items: [...firstItems, ...restItems],
      totalItems: firstCount + restCount,
    };
  }

  /** An existing client of the brand picked for a booking; null when unknown or foreign. */
  findForBooking(brandId: string, clientId: string): Promise<Client | null> {
    return this.db.client.findFirst({
      where: { brand: ACTIVE_BRAND_WHERE, id: clientId, brandId },
    });
  }

  /**
   * Inside the booking transaction: saves an email typed for a client whose profile has none,
   * so it is kept only with the booking. A filled email, also one filled concurrently, is never
   * overwritten. Returns the email the profile holds afterwards.
   */
  async fillMissingEmail(
    clientId: string,
    email: string,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    await tx.client.updateMany({
      where: { id: clientId, email: null },
      data: { email },
    });
    const client = await tx.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { email: true },
    });
    return client.email;
  }

  /** Audits an email saved by fillMissingEmail, once its transaction has committed. */
  emitEmailFilled(
    brandId: string,
    client: Client,
    email: string,
    actor: AuditActor,
  ): void {
    const event: AuditLogEvent = {
      brandId,
      entityType: AuditEntity.CLIENT,
      entityId: client.id,
      eventType: AuditEvent.CLIENT_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        changes: diffFields(client, { ...client, email }, CLIENT_AUDIT_FIELDS),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  /**
   * Inside the booking transaction: makes this booking the client's first one, unless the client
   * already has one (also set by a concurrent booking: the row lock serializes the check) or was
   * imported. A source staff set on the profile is kept; otherwise the booking's source is taken.
   * Returns whether this booking acquired the client.
   */
  async recordAcquisition(
    clientId: string,
    acquisition: ClientAcquisition,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const unacquired: Prisma.ClientWhereInput = {
      id: clientId,
      acquiredAt: null,
      importedAt: null,
    };
    const withSource = await tx.client.updateMany({
      where: { ...unacquired, acquisitionSource: null },
      data: {
        acquisitionBookingId: acquisition.bookingId,
        acquiredAt: acquisition.acquiredAt,
        acquisitionSource: acquisition.source,
        acquisitionSourceDetail: acquisition.detail,
      },
    });
    if (withSource.count > 0) return true;
    const keepingSource = await tx.client.updateMany({
      where: unacquired,
      data: {
        acquisitionBookingId: acquisition.bookingId,
        acquiredAt: acquisition.acquiredAt,
      },
    });
    return keepingSource.count > 0;
  }

  /** The source of the client's first booking was corrected: the client's source follows it. */
  async syncAcquisitionSource(
    clientId: string,
    bookingId: string,
    source: TrafficSource | null,
    detail: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.client.updateMany({
      where: { id: clientId, acquisitionBookingId: bookingId },
      data: { acquisitionSource: source, acquisitionSourceDetail: detail },
    });
  }

  /**
   * The client's first booking moved to another client: this client is no longer acquired by it.
   * The next booking acquires the client again.
   */
  async clearAcquisitionBooking(
    clientId: string,
    bookingId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.client.updateMany({
      where: { id: clientId, acquisitionBookingId: bookingId },
      data: {
        acquisitionBookingId: null,
        acquiredAt: null,
        acquisitionSource: null,
        acquisitionSourceDetail: null,
      },
    });
  }

  /** Clients of an active brand acquired in [from, to), per acquisition source. */
  async countAcquiredBySource(
    brandId: string,
    from: Date,
    to: Date,
  ): Promise<AcquisitionSourceCount[]> {
    const rows = await this.db.client.groupBy({
      by: ['acquisitionSource'],
      where: {
        brandId,
        brand: ACTIVE_BRAND_WHERE,
        acquiredAt: { gte: from, lt: to },
      },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      source: row.acquisitionSource as TrafficSource | null,
      count: row._count._all,
    }));
  }

  async findExistingPhones(
    brandId: string,
    phones: string[],
  ): Promise<Set<string>> {
    const existing = new Set<string>();
    if (phones.length === 0) return existing;

    for (let offset = 0; offset < phones.length; offset += PHONE_LOOKUP_CHUNK) {
      const found = await this.db.client.findMany({
        where: {
          brand: ACTIVE_BRAND_WHERE,
          brandId,
          phone: { in: phones.slice(offset, offset + PHONE_LOOKUP_CHUNK) },
        },
        select: { phone: true },
      });
      for (const client of found) existing.add(client.phone);
    }

    return existing;
  }

  async insertImported(
    brandId: string,
    rows: ClientImportRow[],
    actor: AuditActor,
  ): Promise<number> {
    let inserted = 0;
    const occurredAt = new Date();

    for (let offset = 0; offset < rows.length; offset += IMPORT_INSERT_CHUNK) {
      const created = await this.db.client.createManyAndReturn({
        data: rows.slice(offset, offset + IMPORT_INSERT_CHUNK).map((row) => ({
          brandId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email,
          birthDate: row.birthDate
            ? new Date(`${row.birthDate}T00:00:00.000Z`)
            : null,
          gender: row.gender,
          notes: row.notes,
          // Imported clients came before Klendo: their first booking here is not an acquisition.
          importedAt: occurredAt,
        })),
        skipDuplicates: true,
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      inserted += created.length;
      for (const client of created)
        this.emitCreated(brandId, client, actor, occurredAt);
    }

    return inserted;
  }

  private emitCreated(
    brandId: string,
    client: Pick<Client, 'id' | 'firstName' | 'lastName' | 'phone'>,
    actor: AuditActor,
    occurredAt = new Date(),
  ): void {
    const event: AuditLogEvent = {
      brandId,
      entityType: AuditEntity.CLIENT,
      entityId: client.id,
      eventType: AuditEvent.CLIENT_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt,
      actor,
      payload: {
        fullName: `${client.firstName} ${client.lastName}`,
        phone: client.phone,
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private searchConditions(search: string): Prisma.ClientWhereInput[] {
    const conditions: Prisma.ClientWhereInput[] = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { gender: { contains: search, mode: 'insensitive' } },
      { banReason: { contains: search, mode: 'insensitive' } },
    ];
    const terms = search.split(regularExpressions.whitespace).filter(Boolean);
    if (terms.length > 1) {
      conditions.push({
        AND: terms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
          ],
        })),
      });
    }
    // A number typed with spaces or brackets still finds the stored "+375…" form.
    const digits = search.replace(regularExpressions.nonDigit, '');
    if (regularExpressions.phoneLike.test(search) && isPhoneSearchable(digits))
      conditions.push(...this.phoneConditions(digits));
    return conditions;
  }

  private phoneConditions(digits: string): Prisma.ClientWhereInput[] {
    const patterns = phoneSearchPatterns(digits);
    return [
      { phone: { contains: patterns.contains } },
      ...patterns.trunkPrefixes.map((prefix) => ({
        phone: { startsWith: prefix },
      })),
    ];
  }

  /**
   * Source fields of a create (old is null) or an update: an omitted source is kept, a changed
   * source without a detail drops the old detail, and a detail needs a source.
   */
  private acquisitionSourceWrite(
    old: Client | null,
    dto: CreateClientDto | UpdateClientDto,
  ): {
    acquisitionSource: TrafficSource | null;
    acquisitionSourceDetail: string | null;
  } {
    const { source, detail } = editTrafficSource(
      {
        source: (old?.acquisitionSource as TrafficSource | null) ?? null,
        detail: old?.acquisitionSourceDetail ?? null,
      },
      dto.acquisitionSource,
      dto.acquisitionSourceDetail,
    );
    return { acquisitionSource: source, acquisitionSourceDetail: detail };
  }

  private buildClientFields(dto: CreateClientDto | UpdateClientDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      email: dto.email ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender ?? null,
      notes: dto.notes ?? null,
    };
  }
}
