import { EmailTemplate } from '../channels/email/email.renderer.js';
import { ChannelPayload } from './channel-payload.interface.js';

export interface HasEmailChannel {
  readonly emailTemplate: EmailTemplate;
  toEmail(): ChannelPayload;
}
