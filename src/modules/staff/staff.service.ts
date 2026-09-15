import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Staff, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { BusinessService } from '../business/business.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffSearchOrderBy } from './enums/staff-search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';

@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly businessService: BusinessService,
  ) {}

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

  private async assertMember(businessId: string, payload: TokenPayloadDto): Promise<void> {
    if (payload.role === UserRole.ADMIN) return;

    const membership = await this.db.membership.findUnique({
      where: { userId_businessId: { userId: payload.sub, businessId } },
    });

    if (!membership) throw new ForbiddenException('Access denied');
  }
}
