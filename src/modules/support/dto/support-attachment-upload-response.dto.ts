import { ApiProperty } from '@nestjs/swagger';
import { SupportAttachment } from '@prisma/client';

export class SupportAttachmentUploadResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Pass in fileIds when sending the support request',
  })
  id: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  fileSizeBytes: number;

  static fromEntity(
    attachment: SupportAttachment,
  ): SupportAttachmentUploadResponseDto {
    return Object.assign(new SupportAttachmentUploadResponseDto(), {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
    });
  }
}
