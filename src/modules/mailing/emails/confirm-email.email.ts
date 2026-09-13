import { AbstractEmail } from './abstract.email.js';

export class ConfirmEmailEmail extends AbstractEmail {
  to: string;
  subject = 'Confirm your email';
  text: string;

  constructor(email: string, confirmLink: string) {
    super();
    this.to = email;
    this.text = `Click the link to confirm your email: ${confirmLink}`;
  }
}
