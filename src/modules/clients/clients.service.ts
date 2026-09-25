import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Client, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
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
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.CLIENT,
      entityId: client.id,
      eventType: AuditEvent.CLIENT_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: { fullName: `${client.firstName} ${client.lastName}`, phone: client.phone },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
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

    if (dto.search) {
      where.OR = [
        { firstName: { contains: dto.search, mode: 'insensitive' } },
        { lastName: { contains: dto.search, mode: 'insensitive' } },
        { phone: { contains: dto.search } },
        { email: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ClientOrderByWithRelationInput = {
      [dto.orderBy ?? ClientSearchOrderBy.CREATED_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.ClientFindManyArgs = { where, orderBy };
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

  async insertImported(businessId: string, rows: ClientImportRow[]): Promise<number> {
    let inserted = 0;

    for (let offset = 0; offset < rows.length; offset += IMPORT_INSERT_CHUNK) {
      const result = await this.db.client.createMany({
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
      });
      inserted += result.count;
    }

    return inserted;
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
