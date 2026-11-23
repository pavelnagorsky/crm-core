import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ExclusiveCron } from '../../../shared/cron/decorators/exclusive-cron.decorator.js';
import { PrivateFilesService } from './private-files.service.js';

@Injectable()
export class PrivateFileCleanupService {
  private readonly logger = new Logger(PrivateFileCleanupService.name);

  constructor(private readonly privateFiles: PrivateFilesService) {}

  @ExclusiveCron(CronExpression.EVERY_HOUR)
  async purgeUnattached(): Promise<void> {
    const count = await this.privateFiles.purgeUnattached();
    if (count > 0)
      this.logger.log(`Purged ${count} unattached private file(s)`);
  }
}
