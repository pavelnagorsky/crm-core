export interface EmailDeliveryResult {
  subject: string;
  /** `Message-ID` the SMTP server accepted. */
  providerMessageId: string | null;
}
