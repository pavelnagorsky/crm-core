import { AbstractEmail } from './abstract.email.js';

export class ResetPasswordEmail extends AbstractEmail {
  to: string;
  subject = 'Reset your password';
  text: string;

  constructor(email: string, resetLink: string) {
    super();
    this.to = email;
    this.text = `Click the link to reset your password: ${resetLink}`;
  }
}
