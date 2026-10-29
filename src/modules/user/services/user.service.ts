import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}

  async findById(
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<User> {
    const user = await tx.user.findUnique({ where: { id } });
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

  async findAccessParticipants(userIds: string[]) {
    if (!userIds.length) return [];
    return this.db.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }

  update(
    id: string,
    data: Prisma.UserUpdateInput,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<User> {
    return tx.user.update({ where: { id }, data });
  }

  async confirmEmail(
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<User> {
    const { count } = await tx.user.updateMany({
      where: { id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    if (count !== 1) throw new UnauthorizedException();
    return this.findById(id, tx);
  }

  async getTokenEpoch(
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<number> {
    const user = await tx.user.findUnique({
      where: { id },
      select: { tokenEpoch: true },
    });
    if (!user) throw new UnauthorizedException();
    return user.tokenEpoch;
  }

  async invalidateTokens(
    id: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<number> {
    const user = await tx.user.update({
      where: { id },
      data: { tokenEpoch: { increment: 1 } },
      select: { tokenEpoch: true },
    });
    return user.tokenEpoch;
  }
}
