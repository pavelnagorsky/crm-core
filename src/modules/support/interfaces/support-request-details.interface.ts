import { SignedPrivateFile } from '../../files/interfaces/signed-private-file.interface.js';
import { SupportRequestWithAttachments } from './support-request-with-attachments.interface.js';

export interface SupportRequestDetails {
  request: SupportRequestWithAttachments;
  files: SignedPrivateFile[];
}
