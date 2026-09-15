import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Staff, StaffShift, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { BusinessService } from '../business/business.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchOrderBy } from './enums/staff-search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { GetShiftsRequestDto } from './dto/get-shifts-request.dto.js';
import { ReplaceShiftsRequestDto } from './dto/replace-shifts-request.dto.js';

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly businessService: BusinessService,
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

  async create(businessId: string, payload: TokenPayloadDto, dto: CreateStaffDto): Promise<Staff> {
    await this.businessService.assertOwner(businessId, payload);

    return this.db.staff.create({
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
  }

  async update(staffId: string, payload: TokenPayloadDto, dto: UpdateStaffDto): Promise<Staff> {
    const staff = await this.findById(staffId);
    await this.businessService.assertOwner(staff.businessId, payload);

    return this.db.staff.update({
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
  }

  async findById(staffId: string): Promise<Staff> {
    const staff = await this.db.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async search(businessId: string, payload: TokenPayloadDto, dto: StaffSearchRequestDto): Promise<PaginatedResult<Staff>> {
    await this.assertMember(businessId, payload);

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

  async delete(staffId: string, payload: TokenPayloadDto): Promise<void> {
    const staff = await this.findById(staffId);
    await this.businessService.assertOwner(staff.businessId, payload);
    await this.db.staff.delete({ where: { id: staffId } });
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

  private async assertMember(businessId: string, payload: TokenPayloadDto): Promise<void> {
    if (payload.role === UserRole.ADMIN) return;

    const membership = await this.db.membership.findUnique({
      where: { userId_businessId: { userId: payload.sub, businessId } },
    });

    if (!membership) throw new ForbiddenException('Access denied');
  }
}

function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}
