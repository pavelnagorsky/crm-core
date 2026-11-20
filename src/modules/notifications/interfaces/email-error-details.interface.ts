export interface EmailErrorDetails {
  message: string;
  /** SMTP reply code, when the server answered. */
  code: number | null;
  /** Retrying cannot help: a rejected mailbox, a broken template, a deleted business. */
  permanent: boolean;
}
