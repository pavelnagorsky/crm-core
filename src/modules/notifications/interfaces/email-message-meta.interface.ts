import { EmailAudience } from '@prisma/client';
import { EmailReference } from './email-reference.interface.js';

export interface EmailMessageMeta {
  audience: EmailAudience;
  reference: EmailReference;
}
