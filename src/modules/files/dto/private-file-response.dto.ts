import { ApiProperty } from '@nestjs/swagger';
import { SignedPrivateFile } from '../interfaces/signed-private-file.interface.js';

export class PrivateFileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description:
      'Signed link to the private file; stops working at urlExpiresAt. Fetch the owning entity again for a new one',
  })
  url: string;

  @ApiProperty()
  urlExpiresAt: Date;

  @ApiProperty({ example: 'photo.jpg' })
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 204800 })
  fileSizeBytes: number;

  static fromSigned({
    file,
    url,
    expiresAt,
  }: SignedPrivateFile): PrivateFileResponseDto {
    return Object.assign(new PrivateFileResponseDto(), {
      id: file.id,
      url,
      urlExpiresAt: expiresAt,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    });
  }
}
