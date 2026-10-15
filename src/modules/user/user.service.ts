import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import {
  ACTIVE_BRAND_WHERE,
  ACTIVE_LOCATION_WHERE,
} from '../../shared/database/active-business.where.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { UserWithAccessMemberships } from './interfaces/user-with-access-memberships.interface.js';

@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user)
      throw new AppException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }

  async findByIdWithMemberships(
    id: string,
  ): Promise<UserWithAccessMemberships> {
    const user = await this.db.user.findUnique({
      where: { id },
      include: {
        brandMemberships: {
          where: { brand: ACTIVE_BRAND_WHERE },
          include: {
            brand: {
              select: {
                locations: {
                  where: ACTIVE_LOCATION_WHERE,
                  select: { id: true },
                },
              },
            },
          },
        },
        locationMemberships: {
          where: { location: ACTIVE_LOCATION_WHERE },
          include: {
            location: { select: { brandId: true } },
          },
        },
      },
    });
    if (!user)
      throw new AppException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findFirst({ where: { email } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.db.user.findFirst({ where: { phone } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }
}
