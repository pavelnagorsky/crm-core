import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StaffInvitationStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';

@Injectable()
export class StaffCleanupService {
  private readonly logger = new Logger(StaffCleanupService.name);

  constructor(private readonly db: DatabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireStaffInvitations(): Promise<void> {
    const { count } = await this.db.staffInvitation.updateMany({
      where: {
        status: StaffInvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
        location: ACTIVE_LOCATION_WHERE,
      },
      data: { status: StaffInvitationStatus.EXPIRED },
    });
    if (count > 0) this.logger.log(`Expired ${count} staff invitation(s)`);
  }
}
