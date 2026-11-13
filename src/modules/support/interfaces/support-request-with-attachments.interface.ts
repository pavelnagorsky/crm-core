import { SupportAttachment, SupportRequest } from '@prisma/client';

export interface SupportRequestWithAttachments extends SupportRequest {
  attachments: Pick<SupportAttachment, 'id'>[];
}
