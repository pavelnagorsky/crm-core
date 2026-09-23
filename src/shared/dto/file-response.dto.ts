import { ApiProperty } from '@nestjs/swagger';
import { File } from '@prisma/client';

export class FileResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String })
  url: string;

  static fromEntity(file: File): FileResponseDto {
    const dto = new FileResponseDto();
    dto.id = file.id;
    dto.name = file.fileName;
    dto.url = file.url;
    return dto;
  }
}
