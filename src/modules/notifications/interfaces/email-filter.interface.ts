import { EmailAudience, EmailStatus } from '@prisma/client';
import { EmailTemplate } from '../enums/email-template.enum.js';

export interface EmailFilter {
  status?: EmailStatus[];
  template?: EmailTemplate[];
  audience?: EmailAudience;
  brandId?: string;
  locationId?: string;
  bookingId?: string;
  /** Part of the recipient address or of the subject. */
  search?: string;
  queuedFrom?: string;
  queuedTo?: string;
}
