export const MAIL_EVENT = 'mail.send';

export abstract class AbstractEmail {
  abstract to: string;
  abstract subject: string;
  abstract text: string;
}
