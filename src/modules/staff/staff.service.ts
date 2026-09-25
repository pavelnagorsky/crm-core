import { createHash, randomBytes } from 'crypto';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  BusinessRole,
  File,
  Prisma,
  Staff,
  StaffInvitation,
  StaffInvitationStatus,
  StaffShift,
  StaffStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { ChangeStaffStatusDto } from './dto/change-staff-status.dto.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffFilterDto } from './dto/staff-filter.dto.js';
import { StaffStatusCountResponseDto } from './dto/staff-status-count-response.dto.js';
import { StaffSearchOrderBy } from './enums/staff-search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { GetShiftsRequestDto } from './dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from './dto/replace-shifts-request.dto.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { STAFF_AUDIT_FIELDS } from '../audit/fields/staff.fields.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { StaffInvitationNotification } from '../notifications/notifications/staff-invitation.notification.js';
import { IFrontendConfig } from '../../config/configuration.js';
import { ConfigService } from '@nestjs/config';

export type StaffWithAvatar = Staff & { avatarFile: File | null };

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  listInBusiness(businessId: string): Promise<Staff[]> {
    return this.db.staff.findMany({ where: { businessId }, orderBy: { name: 'asc' } });
  }

  listShiftsInRange(businessId: string, from: Date, to: Date): Promise<StaffShift[]> {
    return this.db.staffShift.findMany({
      where: { staff: { businessId }, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
  }

  listActiveWithServices(
    businessId: string,
  ): Promise<(StaffWithAvatar & { staffServices: { serviceId: string }[] })[]> {
    return this.db.staff.findMany({
      where: { businessId, status: StaffStatus.ACTIVE },
      orderBy: { name: 'asc' },
      include: { avatarFile: true, staffServices: { select: { serviceId: true } } },
    });
  }

  async create(
    businessId: string,
    dto: CreateStaffDto,
    actor: AuditActor,
  ): Promise<StaffWithAvatar> {
    const staff = await this.db.staff.create({
      data: {
        businessId,
        name: dto.name,
        roleTitle: dto.roleTitle ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        avatarFileId: dto.avatarFileId ?? null,
        employmentType: dto.employmentType ?? null,
        taxId: dto.taxId ?? null,
        employeeNumber: dto.employeeNumber ?? null,
        payoutMethod: dto.payoutMethod ?? null,
        payoutNote: dto.payoutNote ?? null,
        staffServices: dto.serviceIds?.length
          ? { create: dto.serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
      },
      include: { avatarFile: true },
    });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.STAFF,
      entityId: staff.id,
      eventType: AuditEvent.STAFF_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: { name: staff.name },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return staff;
  }

  async update(
    businessId: string,
    staffId: string,
    dto: UpdateStaffDto,
    actor: AuditActor,
  ): Promise<StaffWithAvatar> {
    const old = await this.findInBusiness(businessId, staffId);
    if (dto.status !== undefined && dto.status !== old.status) {
      await this.changeStatus(businessId, staffId, { status: dto.status }, actor);
    }
    const staff = await this.db.staff.update({
      where: { id: staffId },
      data: {
        name: dto.name,
        roleTitle: dto.roleTitle,
        phone: dto.phone,
        email: dto.email,
        avatarFileId: dto.avatarFileId,
        employmentType: dto.employmentType,
        taxId: dto.taxId,
        employeeNumber: dto.employeeNumber,
        payoutMethod: dto.payoutMethod,
        payoutNote: dto.payoutNote,
        ...(dto.serviceIds !== undefined && {
          staffServices: {
            deleteMany: {},
            create: dto.serviceIds.map((serviceId) => ({ serviceId })),
          },
        }),
      },
      include: { avatarFile: true },
    });
    const changes = diffFields(old, staff, STAFF_AUDIT_FIELDS).filter(
      (change) => change.field !== 'status',
    );
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        businessId,
        entityType: AuditEntity.STAFF,
        entityId: staffId,
        eventType: AuditEvent.STAFF_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return staff;
  }

  async findById(staffId: string): Promise<StaffWithAvatar> {
    const staff = await this.db.staff.findUnique({ where: { id: staffId }, include: { avatarFile: true } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private async findInBusiness(
    businessId: string,
    staffId: string,
  ): Promise<StaffWithAvatar> {
    const staff = await this.db.staff.findFirst({
      where: { id: staffId, businessId },
      include: { avatarFile: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private buildWhere(businessId: string, filter: StaffFilterDto): Prisma.StaffWhereInput {
    const where: Prisma.StaffWhereInput = { businessId };
    if (filter.search) where.name = { contains: filter.search, mode: 'insensitive' };
    if (filter.status !== undefined) where.status = filter.status;
    return where;
  }

  async search(
    businessId: string,
    dto: StaffSearchRequestDto,
  ): Promise<PaginatedResult<StaffWithAvatar>> {
    const where = this.buildWhere(businessId, dto);

    const orderBy: Prisma.StaffOrderByWithRelationInput = {
      [dto.orderBy ?? StaffSearchOrderBy.CREATED_AT]:
        dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.StaffFindManyArgs = { where, orderBy, include: { avatarFile: true } };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.staff.findMany({ ...findArgs, include: { avatarFile: true } }),
      this.db.staff.count({ where }),
    ]);

    return { items, totalItems };
  }

  resolveStaffForService(
    businessId: string,
    serviceId: string,
    staffId?: string,
  ): Promise<{ id: string }[]> {
    if (staffId) {
      return this.db.staff.findMany({
        where: {
          id: staffId,
          businessId,
          status: StaffStatus.ACTIVE,
          staffServices: { some: { serviceId } },
        },
        select: { id: true },
      });
    }
    return this.db.staff.findMany({
      where: {
        businessId,
        status: StaffStatus.ACTIVE,
        staffServices: { some: { serviceId } },
      },
      select: { id: true },
    });
  }

  async changeStatus(
    businessId: string,
    staffId: string,
    dto: ChangeStaffStatusDto,
    actor: AuditActor,
  ): Promise<void> {
    const staff = await this.findInBusiness(businessId, staffId);
    if (staff.status === dto.status)
      throw new AppException(ErrorCode.STAFF_STATUS_ALREADY_SET, HttpStatus.CONFLICT);

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await tx.staff.update({ where: { id: staffId }, data: { status: dto.status } });
      if (dto.status === StaffStatus.INACTIVE) {
        await tx.staffShift.deleteMany({ where: { staffId, date: { gte: now } } });
      }
    });

    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.STAFF,
      entityId: staffId,
      eventType: AuditEvent.STAFF_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: now,
      actor,
      payload: { changes: [{ field: 'status', from: staff.status, to: dto.status }] },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(businessId: string, staffId: string): Promise<void> {
    await this.findInBusiness(businessId, staffId);

    const bookingCount = await this.db.booking.count({ where: { staffId } });
    if (bookingCount > 0)
      throw new AppException(ErrorCode.STAFF_HAS_BOOKINGS, HttpStatus.CONFLICT);

    try {
      await this.db.staff.delete({ where: { id: staffId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.STAFF_HAS_EARNINGS, HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async getStatusCounts(businessId: string): Promise<StaffStatusCountResponseDto[]> {
    const rows = await this.db.staff.groupBy({
      by: ['status'],
      where: { businessId },
      _count: { _all: true },
    });
    return rows.map((r) => {
      const dto = new StaffStatusCountResponseDto();
      dto.status = r.status;
      dto.count = r._count._all;
      return dto;
    });
  }

  getShifts(staffId: string, dto: GetShiftsRequestDto): Promise<StaffShift[]> {
    return this.db.staffShift.findMany({
      where: {
        staffId,
        date: { gte: new Date(dto.from), lte: new Date(dto.to) },
      },
      orderBy: { date: 'asc' },
    });
  }

  async replaceShifts(
    staffId: string,
    dto: ReplaceShiftsRequestDto,
    actor: AuditActor,
  ): Promise<StaffShift[]> {
    const staff = await this.findById(staffId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    const shifts = await this.db.$transaction(async (tx) => {
      await tx.staffShift.deleteMany({
        where: { staffId, date: { gte: from, lte: to } },
      });

      if (dto.shifts.length === 0) return [];

      await tx.staffShift.createMany({
        data: dto.shifts.map((s) => ({
          staffId,
          date: new Date(s.date),
          startTime: parseTime(s.startTime),
          endTime: parseTime(s.endTime),
        })),
      });

      return tx.staffShift.findMany({
        where: { staffId, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      });
    });

    const event: AuditLogEvent = {
      businessId: staff.businessId,
      entityType: AuditEntity.STAFF,
      entityId: staffId,
      eventType: AuditEvent.STAFF_SHIFTS_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { startDate: dto.from, endDate: dto.to },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return shifts;
  }

  async createInvitation(
    staffId: string,
    dto: CreateInvitationDto,
  ): Promise<{ token: string }> {
    const staff = await this.findById(staffId);

    if (staff.userId) {
      throw new AppException(
        ErrorCode.STAFF_ALREADY_LINKED,
        HttpStatus.CONFLICT,
      );
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // revoke any existing pending invitations for this staff member
    await this.db.staffInvitation.updateMany({
      where: { staffId, status: StaffInvitationStatus.PENDING },
      data: { status: StaffInvitationStatus.REVOKED },
    });

    await this.db.staffInvitation.create({
      data: {
        staffId,
        businessId: staff.businessId,
        tokenHash,
        expiresAt: new Date(dto.expiresAt),
      },
    });

    if (dto.email) {
      const cfg = this.config.get<IFrontendConfig>('frontend')!;
      const business = await this.db.business.findFirst({
        where: { id: staff.businessId },
        select: { name: true },
      });
      const businessName = business?.name ?? '';
      this.eventEmitter.emit(
        NOTIFICATION_EVENT,
        new StaffInvitationNotification(
          dto.email,
          `${cfg.domain}/invitation?token=${token}`,
          staff.name,
          businessName,
        ),
      );
    }

    return { token };
  }

  async acceptInvitation(
    userId: string,
    token: string,
  ): Promise<StaffInvitation> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const invitation = await this.db.staffInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation || invitation.status !== StaffInvitationStatus.PENDING) {
      throw new AppException(
        ErrorCode.STAFF_INVITATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (invitation.expiresAt < new Date()) {
      await this.db.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: StaffInvitationStatus.EXPIRED },
      });
      throw new AppException(
        ErrorCode.STAFF_INVITATION_EXPIRED,
        HttpStatus.GONE,
      );
    }

    return this.db.$transaction(async (tx) => {
      try {
        await tx.membership.create({
          data: {
            userId,
            businessId: invitation.businessId,
            role: BusinessRole.STAFF,
          },
        });
      } catch (e: any) {
        if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
          throw new AppException(
            ErrorCode.STAFF_USER_ALREADY_MEMBER,
            HttpStatus.CONFLICT,
          );
        }
        throw e;
      }

      await tx.staff.update({
        where: { id: invitation.staffId },
        data: { userId },
      });

      return tx.staffInvitation.update({
        where: { id: invitation.id },
        data: {
          status: StaffInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
    });
  }
}

function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

