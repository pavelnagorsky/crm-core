import { ApiProperty } from '@nestjs/swagger';
import { File } from '@prisma/client';

export class SupportAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  fileSizeBytes: number;

  static fromEntity(entity: File): SupportAttachmentDto {
    return Object.assign(new SupportAttachmentDto(), {
      id: entity.id,
      url: entity.url,
      fileName: entity.fileName,
      mimeType: entity.mimeType,
      fileSizeBytes: entity.fileSizeBytes,
    });
  }
}
