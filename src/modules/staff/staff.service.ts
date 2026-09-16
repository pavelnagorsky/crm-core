import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Staff, StaffShift } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
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

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  listPublic(businessId: string, serviceId?: string): Promise<Staff[]> {
    return this.db.staff.findMany({
      where: {
        businessId,
        isActive: true,
        ...(serviceId && { staffServices: { some: { serviceId } } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateStaffDto, actor: AuditActor): Promise<Staff> {
    const staff = await this.db.staff.create({
      data: {
        businessId,
        name: dto.name,
        roleTitle: dto.roleTitle ?? null,
        avatarFileId: dto.avatarFileId ?? null,
        isActive: dto.isActive ?? true,
        staffServices: dto.serviceIds?.length
          ? { create: dto.serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
      },
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

  async update(businessId: string, staffId: string, dto: UpdateStaffDto, actor: AuditActor): Promise<Staff> {
    const old = await this.findInBusiness(businessId, staffId);
    const staff = await this.db.staff.update({
      where: { id: staffId },
      data: {
        name: dto.name,
        roleTitle: dto.roleTitle,
        avatarFileId: dto.avatarFileId,
        isActive: dto.isActive,
        ...(dto.serviceIds !== undefined && {
          staffServices: {
            deleteMany: {},
            create: dto.serviceIds.map((serviceId) => ({ serviceId })),
          },
        }),
      },
    });
    const changes = diffFields(old, staff, STAFF_AUDIT_FIELDS);
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

  async findById(staffId: string): Promise<Staff> {
    const staff = await this.db.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private async findInBusiness(businessId: string, staffId: string): Promise<Staff> {
    const staff = await this.db.staff.findFirst({ where: { id: staffId, businessId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async search(businessId: string, dto: StaffSearchRequestDto): Promise<PaginatedResult<Staff>> {
    const where: Prisma.StaffWhereInput = { businessId };

    if (dto.search) where.name = { contains: dto.search, mode: 'insensitive' };
    if (dto.isActive !== undefined) where.isActive = dto.isActive;

    const orderBy: Prisma.StaffOrderByWithRelationInput = {
      [dto.orderBy ?? StaffSearchOrderBy.CREATED_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.StaffFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.staff.findMany(findArgs),
      this.db.staff.count({ where }),
    ]);

    return { items, totalItems };
  }

  resolveStaffForService(businessId: string, serviceId: string, staffId?: string): Promise<{ id: string }[]> {
    if (staffId) {
      return this.db.staff.findMany({
        where: { id: staffId, businessId, isActive: true, staffServices: { some: { serviceId } } },
        select: { id: true },
      });
    }
    return this.db.staff.findMany({
      where: { businessId, isActive: true, staffServices: { some: { serviceId } } },
      select: { id: true },
    });
  }

  async delete(businessId: string, staffId: string, actor: AuditActor): Promise<void> {
    const staff = await this.findInBusiness(businessId, staffId);
    await this.db.staff.delete({ where: { id: staffId } });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.STAFF,
      entityId: staffId,
      eventType: AuditEvent.STAFF_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { name: staff.name },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
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

  async replaceShifts(staffId: string, dto: ReplaceShiftsRequestDto): Promise<StaffShift[]> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    return this.db.$transaction(async (tx) => {
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
  }
}

function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}
