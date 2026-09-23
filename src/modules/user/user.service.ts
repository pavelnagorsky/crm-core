import { HttpStatus, Injectable } from '@nestjs/common';
import { Membership, Prisma, User } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';

@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user)
      throw new AppException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }

  async findByIdWithMemberships(id: string): Promise<User & { memberships: Membership[] }> {
    const user = await this.db.user.findUnique({
      where: { id },
      include: { memberships: true },
    });
    if (!user)
      throw new AppException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { phone } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.db.user.update({ where: { id }, data });
  }
}
