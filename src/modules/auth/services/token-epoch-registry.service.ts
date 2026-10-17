import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserService } from '../../user/services/user.service.js';

@Injectable()
export class TokenEpochRegistryService {
  constructor(private readonly users: UserService) {}

  get(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    return this.users.getTokenEpoch(userId, tx);
  }

  bump(userId: string, tx?: Prisma.TransactionClient): Promise<number> {
    // Persisted atomic increments survive restarts and concurrent changes on other nodes.
    return this.users.invalidateTokens(userId, tx);
  }

  async bumpMany(
    userIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await Promise.all(
      [...new Set(userIds)].map((userId) => this.bump(userId, tx)),
    );
  }
}
