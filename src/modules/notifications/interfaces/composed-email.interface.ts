import { RenderedEmail } from './rendered-email.interface.js';

/** A rendered email ready for SMTP. */
export interface ComposedEmail extends RenderedEmail {
  to: string;
  /** The sender mailbox address; also the SMTP login. */
  from: string;
  replyTo: string | null;
}
