import { EmailTemplate } from '../enums/email-template.enum.js';
import { ChannelPayload } from './channel-payload.interface.js';

/** What to render and to whom. Data read back from the log holds dates as ISO strings. */
export interface EmailContent extends ChannelPayload {
  template: EmailTemplate;
}
