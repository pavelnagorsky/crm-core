import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AbstractEmail, MAIL_EVENT } from './emails/abstract.email.js';

@Injectable()
export class MailingService {
  private readonly logger = new Logger(MailingService.name);

  @OnEvent(MAIL_EVENT)
  sendEmail(email: AbstractEmail): void {
    this.logger.log(`[MAIL] to=${email.to} subject="${email.subject}"`);
    // TODO: wire up real mailer (e.g. @nestjs-modules/mailer) here
  }
}
