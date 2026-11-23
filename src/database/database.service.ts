import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { IDatabasePoolStats } from './interfaces/database-pool-stats.interface.js';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** Created here rather than by the adapter only to read its stats; the adapter still owns and closes it. */
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const pool = new Pool({
      connectionString: config.get<string>('database.url'),
      max: config.get<number>('database.poolSize'),
    });
    super({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
      transactionOptions: {
        timeout: 10_000,
      },
    });
    this.pool = pool;
  }

  get poolStats(): IDatabasePoolStats {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
