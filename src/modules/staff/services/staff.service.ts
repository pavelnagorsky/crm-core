import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Staff, StaffShift, StaffStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { sanitizeRichHtml } from '../../../shared/html/sanitize-rich-html.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AccessService } from '../../access/services/access.service.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { STAFF_AUDIT_FIELDS } from '../../audit/fields/staff.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { TokenEpochRegistryService } from '../../auth/services/token-epoch-registry.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { UserService } from '../../user/services/user.service.js';
import { ChangeStaffStatusDto } from '../dto/change-staff-status.dto.js';
import { CreateStaffDto } from '../dto/create-staff.dto.js';
import { GetShiftsRequestDto } from '../dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from '../dto/replace-shifts-request.dto.js';
import { StaffFilterDto } from '../dto/staff-filter.dto.js';
import { StaffSearchRequestDto } from '../dto/staff-search-request.dto.js';
import { StaffStatusCountResponseDto } from '../dto/staff-status-count-response.dto.js';
import { UpdateStaffDto } from '../dto/update-staff.dto.js';
import { StaffSearchOrderBy } from '../enums/staff-search-order-by.enum.js';
import { StaffWithAvatar } from '../interfaces/staff-with-avatar.interface.js';
import { StaffWithServiceCount } from '../interfaces/staff-with-service-count.interface.js';

const STAFF_DESCRIPTION_MAX_LENGTH = 2_000;

const staffViewInclude = {
  avatarFile: true,
  _count: { select: { staffServices: true } },
  staffServices: { select: { serviceId: true } },
} satisfies Prisma.StaffInclude;

@Injectable()
export class StaffService {
  async resolveInvitationProfile(
    locationId: string,
    staffId: string,
    tx: Prisma.TransactionClient,
  ) {
    const staff = await tx.staff.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: staffId,
        locationId,
        status: 'ACTIVE',
      },
    });
    if (!staff)
      throw new AppException(
        ErrorCode.ACCESS_GRANT_INVALID,
        HttpStatus.CONFLICT,
      );
    return staff;
  }

  async releaseAccessProfile(
    locationId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    await tx.staff.updateMany({
      where: { locationId, userId },
      data: { userId: null },
    });
  }

  async bindAccessProfile(
    locationId: string,
    staffId: string,
    userId: string,
    tx: Prisma.TransactionClient,
  ) {
    const staff = await this.resolveInvitationProfile(locationId, staffId, tx);
    const occupied = await tx.staff.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        userId,
        NOT: { id: staffId },
      },
    });
    if ((staff.userId && staff.userId !== userId) || occupied)
      throw new AppException(
        ErrorCode.ACCESS_GRANT_INVALID,
        HttpStatus.CONFLICT,
      );
    const result = await tx.staff.updateMany({
      where: {
        id: staffId,
        locationId,
        status: 'ACTIVE',
        OR: [{ userId: null }, { userId }],
      },
      data: { userId },
    });
    if (result.count !== 1)
      throw new AppException(
        ErrorCode.ACCESS_GRANT_INVALID,
        HttpStatus.CONFLICT,
      );
    return this.resolveInvitationProfile(locationId, staffId, tx);
  }

  accessProfilesForUser(userId: string) {
    return this.db.staff.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, userId, status: 'ACTIVE' },
    });
  }

  async resolveOwnProfile(locationId: string, userId: string): Promise<Staff> {
    const profile = await this.db.staff.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        userId,
        status: StaffStatus.ACTIVE,
      },
    });
    if (!profile)
      throw new ForbiddenException('An active staff profile is required');
    return profile;
  }
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
    private readonly access: AccessService,
    private readonly users: UserService,
    private readonly epochs: TokenEpochRegistryService,
  ) {}

  listInLocation(locationId: string): Promise<Staff[]> {
    return this.db.staff.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, locationId },
      orderBy: { name: 'asc' },
    });
  }

  resolveForProductSale(
    locationId: string,
    staffIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Staff[]> {
    if (staffIds.length === 0) return Promise.resolve([]);
    return (tx ?? this.db).staff.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: { in: staffIds },
        locationId,
        status: StaffStatus.ACTIVE,
      },
      orderBy: { id: 'asc' },
    });
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.staff.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  listShiftsInRange(
    locationId: string,
    from: Date,
    to: Date,
    staffIds?: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<StaffShift[]> {
    return (tx ?? this.db).staffShift.findMany({
      where: {
        staff: { location: ACTIVE_LOCATION_WHERE, locationId },
        date: { gte: from, lte: to },
        ...(staffIds?.length ? { staffId: { in: staffIds } } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  listShiftsForStaff(
    staffIds: string[],
    from: Date,
    to: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffShift[]> {
    if (staffIds.length === 0) return Promise.resolve([]);
    return (tx ?? this.db).staffShift.findMany({
      where: {
        staff: { location: ACTIVE_LOCATION_WHERE },
        staffId: { in: staffIds },
        date: { gte: from, lte: to },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  findShiftForDate(
    staffId: string,
    date: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<StaffShift | null> {
    return (tx ?? this.db).staffShift.findFirst({
      where: { staff: { location: ACTIVE_LOCATION_WHERE }, staffId, date },
    });
  }

  listActiveWithServices(
    locationId: string,
  ): Promise<(StaffWithAvatar & { staffServices: { serviceId: string }[] })[]> {
    return this.db.staff.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        status: StaffStatus.ACTIVE,
      },
      orderBy: { name: 'asc' },
      include: {
        avatarFile: true,
        staffServices: { select: { serviceId: true } },
      },
    });
  }

  async create(
    locationId: string,
    dto: CreateStaffDto,
    actor: AuditActor,
  ): Promise<StaffWithAvatar> {
    const staff = await this.db.staff.create({
      data: {
        locationId,
        name: dto.name,
        roleTitle: dto.roleTitle ?? null,
        description: this.normalizeDescription(dto.description) ?? null,
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
      locationId,
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
    locationId: string,
    staffId: string,
    dto: UpdateStaffDto,
    actor: AuditActor,
  ): Promise<StaffWithAvatar> {
    const old = await this.findInLocation(locationId, staffId);
    if (dto.status !== undefined && dto.status !== old.status) {
      await this.changeStatus(
        locationId,
        staffId,
        { status: dto.status },
        actor,
      );
    }
    const staff = await this.db.staff.update({
      where: { id: staffId },
      data: {
        name: dto.name,
        roleTitle: dto.roleTitle,
        description: this.normalizeDescription(dto.description),
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
        locationId,
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
    const staff = await this.db.staff.findUnique({
      where: { location: ACTIVE_LOCATION_WHERE, id: staffId },
      include: { avatarFile: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async findWithServiceCount(staffId: string): Promise<StaffWithServiceCount> {
    const staff = await this.db.staff.findUnique({
      where: { location: ACTIVE_LOCATION_WHERE, id: staffId },
      include: staffViewInclude,
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async findWithServiceCountInLocation(
    locationId: string,
    staffId: string,
  ): Promise<StaffWithServiceCount> {
    const staff = await this.db.staff.findFirst({
      where: { location: ACTIVE_LOCATION_WHERE, id: staffId, locationId },
      include: staffViewInclude,
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private normalizeDescription(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value == null) return value;
    const html = sanitizeRichHtml(value);
    if (!html) return null;
    if (html.length > STAFF_DESCRIPTION_MAX_LENGTH) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
      );
    }
    return html;
  }

  private async findInLocation(
    locationId: string,
    staffId: string,
  ): Promise<StaffWithAvatar> {
    const staff = await this.db.staff.findFirst({
      where: { location: ACTIVE_LOCATION_WHERE, id: staffId, locationId },
      include: { avatarFile: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private buildWhere(
    locationId: string,
    filter: StaffFilterDto,
  ): Prisma.StaffWhereInput {
    const where: Prisma.StaffWhereInput = {
      location: ACTIVE_LOCATION_WHERE,
      locationId,
    };
    const search = filter.search?.trim();
    if (search) {
      const terms = search.split(regularExpressions.whitespace).filter(Boolean);
      where.AND = terms.map((term) => ({
        name: { contains: term, mode: 'insensitive' as const },
      }));
    }
    if (filter.status !== undefined) where.status = filter.status;
    return where;
  }

  async search(
    locationId: string,
    dto: StaffSearchRequestDto,
  ): Promise<PaginatedResult<StaffWithServiceCount>> {
    const where = this.buildWhere(locationId, dto);

    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy: Prisma.StaffOrderByWithRelationInput = {
      [dto.orderBy ?? StaffSearchOrderBy.CREATED_AT]: direction,
    };

    const findArgs: Prisma.StaffFindManyArgs = {
      where,
      orderBy: stableOrderBy(orderBy, direction),
      include: staffViewInclude,
    };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.staff.findMany({ ...findArgs, include: staffViewInclude }),
      this.db.staff.count({ where }),
    ]);

    return { items, totalItems };
  }

  resolveStaffForService(
    locationId: string,
    serviceId: string,
    staffId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string }[]> {
    return (tx ?? this.db).staff.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        ...(staffId ? { id: staffId } : {}),
        status: StaffStatus.ACTIVE,
        staffServices: { some: { serviceId } },
      },
      select: { id: true },
    });
  }

  async resolveStaffingForServices(
    locationId: string,
    serviceIds: string[],
  ): Promise<{
    coverableBySingle: { id: string; name: string }[];
    requiresMultiple: boolean;
  }> {
    const uniqueServiceIds = [...new Set(serviceIds)];
    if (uniqueServiceIds.length === 0)
      return { coverableBySingle: [], requiresMultiple: false };

    const staff = await this.db.staff.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        status: StaffStatus.ACTIVE,
        staffServices: { some: { serviceId: { in: uniqueServiceIds } } },
      },
      select: {
        id: true,
        name: true,
        staffServices: { select: { serviceId: true } },
      },
      orderBy: { name: 'asc' },
    });

    const coverableBySingle = staff
      .filter((member) => {
        const performed = new Set(
          member.staffServices.map((service) => service.serviceId),
        );
        return uniqueServiceIds.every((serviceId) => performed.has(serviceId));
      })
      .map((member) => ({ id: member.id, name: member.name }));

    return {
      coverableBySingle,
      requiresMultiple: coverableBySingle.length === 0,
    };
  }

  async servicesPerformableBy(
    locationId: string,
    staffId: string,
  ): Promise<string[]> {
    const staff = await this.db.staff.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: staffId,
        locationId,
        status: StaffStatus.ACTIVE,
      },
      select: { staffServices: { select: { serviceId: true } } },
    });
    return staff?.staffServices.map((service) => service.serviceId) ?? [];
  }

  async changeStatus(
    locationId: string,
    staffId: string,
    dto: ChangeStaffStatusDto,
    actor: AuditActor,
  ): Promise<void> {
    const staff = await this.findInLocation(locationId, staffId);
    if (staff.status === dto.status)
      throw new AppException(
        ErrorCode.STAFF_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );

    const now = new Date();
    const location = await this.locationService.findById(locationId);
    await this.db.$transaction(async (tx) => {
      await this.access.lockBrand(location.brandId, tx);
      const current = await tx.staff.findUniqueOrThrow({
        where: { id: staffId },
      });
      if (dto.status === StaffStatus.INACTIVE)
        await this.protectPlatformAccount(current.userId, actor.id, tx);
      if (dto.status === StaffStatus.INACTIVE) {
        await this.access.revokeStaffAccess(
          location.brandId,
          locationId,
          staffId,
          current.userId,
          tx,
          actor.id ?? 'system',
        );
        if (current.userId) {
          await this.releaseAccessProfile(locationId, current.userId, tx);
          await this.epochs.bump(current.userId, tx);
        }
      }
      await tx.staff.update({
        where: { id: staffId },
        data: { status: dto.status },
      });
      if (dto.status === StaffStatus.INACTIVE) {
        await tx.staffShift.deleteMany({
          where: { staffId, date: { gte: now } },
        });
      }
    });

    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.STAFF,
      entityId: staffId,
      eventType: AuditEvent.STAFF_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: now,
      actor,
      payload: {
        changes: [{ field: 'status', from: staff.status, to: dto.status }],
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(
    locationId: string,
    staffId: string,
    actor?: AuditActor,
  ): Promise<void> {
    await this.findInLocation(locationId, staffId);
    const location = await this.locationService.findById(locationId);
    try {
      await this.db.$transaction(async (tx) => {
        await this.access.lockBrand(location.brandId, tx);
        const current = await tx.staff.findUniqueOrThrow({
          where: { id: staffId },
        });
        await this.protectPlatformAccount(current.userId, actor?.id, tx);
        await this.access.revokeStaffAccess(
          location.brandId,
          locationId,
          staffId,
          current.userId,
          tx,
          actor?.id ?? 'system',
        );
        await tx.staff.delete({ where: { id: staffId } });
        if (current.userId) await this.epochs.bump(current.userId, tx);
      });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        const constraint = String(e?.meta?.constraint ?? '');
        throw new AppException(
          constraint.includes('StaffEarning')
            ? ErrorCode.STAFF_HAS_EARNINGS
            : ErrorCode.STAFF_HAS_BOOKINGS,
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
  }

  private async protectPlatformAccount(
    userId: string | null,
    actorId: string | null | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (
      userId &&
      userId !== actorId &&
      (await this.users.findById(userId, tx)).role === 'ADMIN'
    )
      throw new ForbiddenException(
        'Platform administrator access cannot be changed',
      );
  }

  async getStatusCounts(
    locationId: string,
  ): Promise<StaffStatusCountResponseDto[]> {
    const rows = await this.db.staff.groupBy({
      by: ['status'],
      where: { location: ACTIVE_LOCATION_WHERE, locationId },
      _count: { _all: true },
    });
    return rows.map((r) => {
      const dto = new StaffStatusCountResponseDto();
      dto.status = r.status;
      dto.count = r._count._all;
      return dto;
    });
  }

  async getShifts(
    locationId: string,
    staffId: string,
    dto: GetShiftsRequestDto,
  ): Promise<StaffShift[]> {
    await this.findInLocation(locationId, staffId);
    return this.db.staffShift.findMany({
      where: {
        staff: { location: ACTIVE_LOCATION_WHERE },
        staffId,
        date: { gte: new Date(dto.from), lte: new Date(dto.to) },
      },
      orderBy: { date: 'asc' },
    });
  }

  async replaceShifts(
    locationId: string,
    staffId: string,
    dto: ReplaceShiftsRequestDto,
    actor: AuditActor,
  ): Promise<StaffShift[]> {
    const staff = await this.findInLocation(locationId, staffId);
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
        where: {
          staff: { location: ACTIVE_LOCATION_WHERE },
          staffId,
          date: { gte: from, lte: to },
        },
        orderBy: { date: 'asc' },
      });
    });

    const event: AuditLogEvent = {
      locationId: staff.locationId,
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
}

function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}
