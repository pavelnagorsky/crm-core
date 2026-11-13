import { ApiProperty } from '@nestjs/swagger';
import { SignedSupportAttachment } from '../interfaces/signed-support-attachment.interface.js';

export class SupportAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description:
      'Signed link to the private file; stops working at urlExpiresAt, reload the request for a new one',
  })
  url: string;

  @ApiProperty()
  urlExpiresAt: Date;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  fileSizeBytes: number;

  static fromSigned({
    attachment,
    url,
    expiresAt,
  }: SignedSupportAttachment): SupportAttachmentDto {
    return Object.assign(new SupportAttachmentDto(), {
      id: attachment.id,
      url,
      urlExpiresAt: expiresAt,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
    });
  }
}
