import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Business, BusinessRole, Prisma, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { UserService } from '../user/user.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';
import { BusinessSearchRequestDto } from './dto/business-search-request.dto.js';
import { BusinessSearchOrderBy } from './enums/search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';

@Injectable()
export class BusinessService {
  constructor(
    private readonly db: DatabaseService,
    private readonly userService: UserService,
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
        memberships: {
          create: { userId, role: BusinessRole.OWNER },
        },
        staff: {
          create: { userId, name: staffName },
        },
      },
    });
  }

  async update(businessId: string, payload: TokenPayloadDto, dto: UpdateBusinessDto): Promise<Business> {
    await this.assertOwner(businessId, payload);

    return this.db.business.update({
      where: { id: businessId },
      data: {
        name: dto.name,
        logoFileId: dto.logoFileId,
        advanceBookingWindowDays: dto.advanceBookingWindowDays,
        slotIntervalMinutes: dto.slotIntervalMinutes,
        minimumBookingNoticeMinutes: dto.minimumBookingNoticeMinutes,
        timezone: dto.timezone,
      },
    });
  }

  async findById(businessId: string): Promise<Business> {
    const business = await this.db.business.findUnique({ where: { id: businessId } });

    if (!business) throw new NotFoundException('Business not found');

    return business;
  }

  async search(payload: TokenPayloadDto, dto: BusinessSearchRequestDto): Promise<PaginatedResult<Business>> {
    const where: Prisma.BusinessWhereInput = {};

    if (payload.role !== UserRole.ADMIN) {
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

    const findArgs: Prisma.BusinessFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.business.findMany(findArgs),
      this.db.business.count({ where }),
    ]);

    return { items, totalItems };
  }

  async delete(businessId: string, payload: TokenPayloadDto): Promise<void> {
    await this.assertOwner(businessId, payload);
    await this.db.business.delete({ where: { id: businessId } });
  }

  async assertOwner(businessId: string, payload: TokenPayloadDto): Promise<void> {
    if (payload.role === UserRole.ADMIN) return;

    const membership = await this.db.membership.findUnique({
      where: { userId_businessId: { userId: payload.sub, businessId } },
    });

    if (!membership || membership.role !== BusinessRole.OWNER)
      throw new ForbiddenException('Access denied');
  }
}
