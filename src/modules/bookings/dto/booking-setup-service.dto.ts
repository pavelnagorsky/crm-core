import { ApiProperty } from '@nestjs/swagger';
import { Service } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';

export class BookingSetupServiceDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageFileId: string | null;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  static fromEntity(service: Service): BookingSetupServiceDto {
    const dto = new BookingSetupServiceDto();
    dto.id = service.id;
    dto.title = service.title;
    dto.description = service.description;
    dto.imageFileId = service.imageFileId;
    dto.price = MoneyService.format(service.price);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
