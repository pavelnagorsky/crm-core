import { SendMailOptions } from 'nodemailer';

export interface RenderedEmail {
  subject: string;
  html: string;
  senderName: string;
  attachments?: SendMailOptions['attachments'];
}
