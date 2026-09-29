import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { SetClientBanDto } from './dto/set-client-ban.dto.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';
import { ClientSearchOrderBy } from './enums/client-search-order-by.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { CLIENT_AUDIT_FIELDS } from '../audit/fields/client.fields.js';
import { ClientImportRow } from './clients-import/interfaces/client-import-row.interface.js';

const PHONE_LOOKUP_CHUNK = 500;
const IMPORT_INSERT_CHUNK = 200;

@Injectable()
export class ClientsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(businessId: string, dto: CreateClientDto, actor: AuditActor): Promise<Client> {
    let client: Client;
    try {
      client = await this.db.client.create({ data: { businessId, ...this.buildClientFields(dto) } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(ErrorCode.CLIENT_PHONE_EXISTS, HttpStatus.CONFLICT);
      }
      throw e;
    }
    this.emitCreated(businessId, client, actor);
    return client;
  }

  async update(businessId: string, clientId: string, dto: UpdateClientDto, actor: AuditActor): Promise<Client> {
    const old = await this.findInBusiness(businessId, clientId);
    let client: Client;
    try {
      client = await this.db.client.update({ where: { id: clientId }, data: this.buildClientFields(dto) });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        throw new AppException(ErrorCode.CLIENT_PHONE_EXISTS, HttpStatus.CONFLICT);
      }
      throw e;
    }
    const changes = diffFields(old, client, CLIENT_AUDIT_FIELDS);
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        businessId,
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

  async setBan(businessId: string, clientId: string, dto: SetClientBanDto, actor: AuditActor): Promise<void> {
    const old = await this.findInBusiness(businessId, clientId);
    const banReason = dto.banned ? (dto.reason ?? '').trim() : null;
    if (dto.banned && !banReason) {
      throw new AppException(ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST);
    }

    const now = new Date();
    const bannedAt = dto.banned ? (old.bannedAt ?? now) : null;
    if ((old.bannedAt !== null) === dto.banned && old.banReason === banReason) {
      throw new AppException(ErrorCode.CLIENT_BAN_ALREADY_SET, HttpStatus.CONFLICT);
    }

    const client = await this.db.client.update({
      where: { id: clientId },
      data: { bannedAt, banReason },
    });
    const changes = diffFields(old, client, CLIENT_AUDIT_FIELDS);
    if (changes.length === 0) return;

    const event: AuditLogEvent = {
      businessId,
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
    const client = await this.db.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async findInBusiness(businessId: string, clientId: string): Promise<Client> {
    const client = await this.db.client.findFirst({ where: { id: clientId, businessId } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  resolveForBooking(
    businessId: string,
    phone: string,
    firstName: string,
    lastName: string,
    email?: string,
  ): Promise<Client> {
    return this.db.client.upsert({
      where: { businessId_phone: { businessId, phone } },
      update: {},
      create: { businessId, firstName, lastName, phone, email: email ?? null },
    });
  }

  async search(businessId: string, dto: ClientSearchRequestDto): Promise<PaginatedResult<Client>> {
    const where: Prisma.ClientWhereInput = { businessId };

    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { gender: { contains: search, mode: 'insensitive' } },
        { banReason: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dto.banned === true) where.bannedAt = { not: null };
    else if (dto.banned === false) where.bannedAt = null;

    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy: Prisma.ClientOrderByWithRelationInput = {
      [dto.orderBy ?? ClientSearchOrderBy.CREATED_AT]: direction,
    };

    const findArgs: Prisma.ClientFindManyArgs = { where, orderBy: stableOrderBy(orderBy, direction) };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.client.findMany(findArgs),
      this.db.client.count({ where }),
    ]);

    return { items, totalItems };
  }

  async findExistingPhones(businessId: string, phones: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    if (phones.length === 0) return existing;

    for (let offset = 0; offset < phones.length; offset += PHONE_LOOKUP_CHUNK) {
      const found = await this.db.client.findMany({
        where: { businessId, phone: { in: phones.slice(offset, offset + PHONE_LOOKUP_CHUNK) } },
        select: { phone: true },
      });
      for (const client of found) existing.add(client.phone);
    }

    return existing;
  }

  async insertImported(businessId: string, rows: ClientImportRow[], actor: AuditActor): Promise<number> {
    let inserted = 0;
    const occurredAt = new Date();

    for (let offset = 0; offset < rows.length; offset += IMPORT_INSERT_CHUNK) {
      const created = await this.db.client.createManyAndReturn({
        data: rows.slice(offset, offset + IMPORT_INSERT_CHUNK).map((row) => ({
          businessId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email,
          birthDate: row.birthDate ? new Date(`${row.birthDate}T00:00:00.000Z`) : null,
          gender: row.gender,
          notes: row.notes,
        })),
        skipDuplicates: true,
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      inserted += created.length;
      for (const client of created) this.emitCreated(businessId, client, actor, occurredAt);
    }

    return inserted;
  }

  private emitCreated(
    businessId: string,
    client: Pick<Client, 'id' | 'firstName' | 'lastName' | 'phone'>,
    actor: AuditActor,
    occurredAt = new Date(),
  ): void {
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.CLIENT,
      entityId: client.id,
      eventType: AuditEvent.CLIENT_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt,
      actor,
      payload: { fullName: `${client.firstName} ${client.lastName}`, phone: client.phone },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
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
