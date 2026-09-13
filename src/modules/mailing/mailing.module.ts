import { Module } from '@nestjs/common';
import { MailingService } from './mailing.service.js';

@Module({
  providers: [MailingService],
  exports: [MailingService],
})
export class MailingModule {}
