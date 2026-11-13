import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportService } from './support.service.js';

@Injectable()
export class SupportAttachmentCleanupService {
  private readonly logger = new Logger(SupportAttachmentCleanupService.name);

  constructor(private readonly support: SupportService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOrphanAttachments(): Promise<void> {
    const count = await this.support.purgeOrphanAttachments();
    if (count > 0)
      this.logger.log(`Purged ${count} unsent support attachment(s)`);
  }
}
