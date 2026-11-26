export interface IMailerConfig {
  /** noreply: the default sender. */
  email: string;
  /** Sends billing emails, gets demo requests. Falls back to `email`. */
  salesEmail: string;
  /** Gets support requests and replies to account emails. Falls back to `email`. */
  supportEmail: string;
  emailPw: string;
  smtpHost: string;
  /** 465 uses implicit TLS; other ports upgrade with STARTTLS. */
  smtpPort: number;
}
