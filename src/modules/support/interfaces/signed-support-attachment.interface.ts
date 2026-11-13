import { SupportAttachment } from '@prisma/client';
import { SignedFileUrl } from '../../files/interfaces/signed-file-url.interface.js';

export interface SignedSupportAttachment extends SignedFileUrl {
  attachment: SupportAttachment;
}
