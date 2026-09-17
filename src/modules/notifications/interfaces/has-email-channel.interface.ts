import { ChannelPayload } from './channel-payload.interface.js';
import { EmailTemplate } from '../channels/email/email-renderer.service.js';

export interface HasEmailChannel {
  readonly emailTemplate: EmailTemplate;
  toEmail(): ChannelPayload;
}
