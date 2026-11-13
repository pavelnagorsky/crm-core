import { SignedSupportAttachment } from './signed-support-attachment.interface.js';
import { SupportRequestWithAttachments } from './support-request-with-attachments.interface.js';

export interface SupportRequestDetails {
  request: SupportRequestWithAttachments;
  files: SignedSupportAttachment[];
}
