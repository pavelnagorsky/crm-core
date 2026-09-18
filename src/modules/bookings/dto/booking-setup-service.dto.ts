import { ApiProperty } from '@nestjs/swagger';
import { Service } from '@prisma/client';

export class BookingSetupServiceDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageFileId: string | null;

  @ApiProperty({ type: Number })
  price: number;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  static fromEntity(service: Service): BookingSetupServiceDto {
    const dto = new BookingSetupServiceDto();
    dto.id = service.id;
    dto.title = service.title;
    dto.description = service.description;
    dto.imageFileId = service.imageFileId;
    dto.price = Number(service.price);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
