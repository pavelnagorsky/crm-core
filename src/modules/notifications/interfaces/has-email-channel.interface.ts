import { EmailTemplate } from '../enums/email-template.enum.js';
import { ChannelPayload } from './channel-payload.interface.js';

export interface HasEmailChannel {
  readonly emailTemplate: EmailTemplate;
  toEmail(): ChannelPayload;
}
