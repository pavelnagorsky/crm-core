import { File } from '@prisma/client';
import { SupportRequestWithAttachments } from './support-request-with-attachments.interface.js';

export interface SupportRequestDetails {
  request: SupportRequestWithAttachments;
  files: File[];
}
