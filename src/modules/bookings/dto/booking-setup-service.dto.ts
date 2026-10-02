import { ApiProperty } from '@nestjs/swagger';
import { File, Service } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';

export class BookingSetupServiceDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  static fromEntity(service: Service & { imageFile: File | null }): BookingSetupServiceDto {
    const dto = new BookingSetupServiceDto();
    dto.id = service.id;
    dto.title = service.title;
    dto.description = service.description;
    dto.image = service.imageFile ? FileResponseDto.fromEntity(service.imageFile) : null;
    dto.price = MoneyService.format(service.price);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
