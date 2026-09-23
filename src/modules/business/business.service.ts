import { Injectable, NotFoundException } from '@nestjs/common';
import { Business, BusinessRole, File, Prisma, UserRole } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { UserService } from '../user/user.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';
import { BusinessSearchRequestDto } from './dto/business-search-request.dto.js';
import { BusinessSearchOrderBy } from './enums/search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { BUSINESS_AUDIT_FIELDS } from '../audit/fields/business.fields.js';

export type BusinessWithLogo = Business & { logoFile: File | null };

export type BusinessWithCounts = BusinessWithLogo & {
  memberships: { role: BusinessRole }[];
  _count: { staff: number; services: number; clients: number };
};

@Injectable()
export class BusinessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateBusinessDto): Promise<Business> {
    const user = await this.userService.findById(userId);
    const staffName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    return this.db.business.create({
      data: {
        name: dto.name,
        logoFileId: dto.logoFileId ?? null,
        advanceBookingWindowDays: dto.advanceBookingWindowDays,
        slotIntervalMinutes: dto.slotIntervalMinutes,
        minimumBookingNoticeMinutes: dto.minimumBookingNoticeMinutes,
        timezone: dto.timezone,
        currency: dto.currency,
        memberships: {
          create: { userId, role: BusinessRole.OWNER },
        },
        staff: {
          create: { userId, name: staffName, phone: user.phone, email: user.email },
        },
      },
    });
  }

  async update(businessId: string, dto: UpdateBusinessDto, actor: AuditActor): Promise<Business> {
    const old = await this.findById(businessId);
    const business = await this.db.business.update({
      where: { id: businessId },
      data: {
        name: dto.name,
        logoFileId: dto.logoFileId,
        advanceBookingWindowDays: dto.advanceBookingWindowDays,
        slotIntervalMinutes: dto.slotIntervalMinutes,
        minimumBookingNoticeMinutes: dto.minimumBookingNoticeMinutes,
        timezone: dto.timezone,
        currency: dto.currency,
        bookingVisibility: dto.bookingVisibility,
        isBookingConfirmationRequired: dto.isBookingConfirmationRequired,
      },
    });
    const changes = diffFields(old, business, BUSINESS_AUDIT_FIELDS);
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        businessId,
        entityType: AuditEntity.BUSINESS,
        entityId: businessId,
        eventType: AuditEvent.BUSINESS_UPDATED,
        actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { changes },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return business;
  }

  async findById(businessId: string): Promise<BusinessWithLogo> {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      include: { logoFile: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async getLocale(businessId: string): Promise<{ timezone: string; currency: string }> {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, currency: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async getLocalesByIds(businessIds: string[]): Promise<Map<string, { timezone: string; currency: string }>> {
    if (businessIds.length === 0) return new Map();
    const rows = await this.db.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, timezone: true, currency: true },
    });
    return new Map(rows.map((r) => [r.id, { timezone: r.timezone, currency: r.currency }]));
  }

  async search(
    payload: TokenPayloadDto,
    dto: BusinessSearchRequestDto,
  ): Promise<BusinessWithCounts[]> {
    const isAdmin = payload.role === UserRole.ADMIN;
    const where: Prisma.BusinessWhereInput = {};

    if (!isAdmin) {
      where.memberships = { some: { userId: payload.sub } };
    }

    if (dto.search) where.name = { contains: dto.search, mode: 'insensitive' };
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }

    const orderBy: Prisma.BusinessOrderByWithRelationInput = {
      [dto.orderBy ?? BusinessSearchOrderBy.CREATED_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const rows = await this.db.business.findMany({
      where,
      orderBy,
      include: {
        logoFile: true,
        memberships: { where: { userId: payload.sub }, select: { role: true } },
        _count: { select: { staff: true, services: true, clients: true } },
      },
    });

    return rows as BusinessWithCounts[];
  }

  async delete(businessId: string): Promise<void> {
    await this.db.business.delete({ where: { id: businessId } });
  }
}
