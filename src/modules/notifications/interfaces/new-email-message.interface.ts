import {
  EmailAudience,
  EmailDeliveryMode,
  EmailSkipReason,
  EmailStatus,
} from '@prisma/client';
import { EmailContent } from './email-content.interface.js';
import { EmailReference } from './email-reference.interface.js';

export interface NewEmailMessage {
  content: EmailContent;
  audience: EmailAudience;
  reference: EmailReference;
  deliveryMode: EmailDeliveryMode;
  status: EmailStatus;
  skipReason?: EmailSkipReason;
  jobId?: string | null;
}
