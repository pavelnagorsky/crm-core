export interface IMailerConfig {
  email: string;
  emailPw: string;
  smtpHost: string;
  /** 465 uses implicit TLS; other ports upgrade with STARTTLS. */
  smtpPort: number;
}
