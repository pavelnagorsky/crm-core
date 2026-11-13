import { SupportRequest, SupportRequestAttachment } from '@prisma/client';

export interface SupportRequestWithAttachments extends SupportRequest {
  attachments: Pick<SupportRequestAttachment, 'privateFileId'>[];
}
