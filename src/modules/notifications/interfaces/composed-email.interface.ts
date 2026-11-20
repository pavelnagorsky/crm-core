import { RenderedEmail } from './rendered-email.interface.js';

/** A rendered email ready for SMTP. */
export interface ComposedEmail extends RenderedEmail {
  to: string;
}
