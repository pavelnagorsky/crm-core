import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';

const TOKEN_EPOCH_KEY_PREFIX = 'auth:token-epoch:';

@Injectable()
export class TokenEpochRegistryService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get(userId: string): Promise<number> {
    return (await this.cache.get<number>(this.key(userId))) ?? 0;
  }

  async bump(userId: string): Promise<number> {
    const epoch = Date.now();
    // This in-memory cache is single-instance correct only. Multi-instance deployments
    // must replace it with a shared store such as Redis or stale tokens can survive on another node.
    await this.cache.set(this.key(userId), epoch, 0);
    return epoch;
  }

  async bumpMany(userIds: string[]): Promise<void> {
    await Promise.all([...new Set(userIds)].map((userId) => this.bump(userId)));
  }

  private key(userId: string): string {
    return `${TOKEN_EPOCH_KEY_PREFIX}${userId}`;
  }
}
