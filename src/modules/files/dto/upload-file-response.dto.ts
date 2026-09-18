import { ApiProperty } from '@nestjs/swagger';

export class UploadFileResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'https://storage.googleapis.com/my-bucket/uploads/abc123.jpg' })
  url: string;

  @ApiProperty({ example: 'photo.jpg' })
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 204800 })
  fileSizeBytes: number;

  static fromEntity(entity: {
    id: string;
    url: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  }): UploadFileResponseDto {
    const dto = new UploadFileResponseDto();
    dto.id = entity.id;
    dto.url = entity.url;
    dto.fileName = entity.fileName;
    dto.mimeType = entity.mimeType;
    dto.fileSizeBytes = entity.fileSizeBytes;
    return dto;
  }
}
