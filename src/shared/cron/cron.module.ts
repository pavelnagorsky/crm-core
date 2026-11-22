import { Module } from '@nestjs/common';
import { CronLockService } from './cron-lock.service.js';

/** Provides the lock behind `@ExclusiveCron`; the service registers itself, so nothing is exported. */
@Module({
  providers: [CronLockService],
})
export class CronModule {}
