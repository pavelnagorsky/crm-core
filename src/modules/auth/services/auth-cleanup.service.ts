import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ExclusiveCron } from '../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { DatabaseService } from '../../../database/database.service.js';

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly db: DatabaseService) {}

  @ExclusiveCron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanExpiredRefreshTokens(): Promise<void> {
    const { count } = await this.db.refreshToken.deleteMany({
      where: { expiryDate: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Deleted ${count} expired refresh token(s)`);
  }
}
