import { ApiProperty } from '@nestjs/swagger';
import { Service } from '@prisma/client';

export class PublicServiceItemDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  imageFileId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number })
  price: number;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  static fromEntity(service: Service): PublicServiceItemDto {
    const dto = new PublicServiceItemDto();
    dto.id = service.id;
    dto.imageFileId = service.imageFileId;
    dto.title = service.title;
    dto.description = service.description;
    dto.price = Number(service.price);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
