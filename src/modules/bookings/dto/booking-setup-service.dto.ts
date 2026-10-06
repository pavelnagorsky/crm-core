import { ApiProperty } from '@nestjs/swagger';
import { File, Service } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';

export class BookingSetupServiceDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ enum: [ServiceCatalogKind.SERVICE] })
  kind: ServiceCatalogKind.SERVICE;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

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

  static fromEntity(
    service: Service & { imageFile: File | null },
  ): BookingSetupServiceDto {
    const dto = new BookingSetupServiceDto();
    dto.id = service.id;
    dto.kind = ServiceCatalogKind.SERVICE;
    dto.categoryId = service.categoryId;
    dto.title = service.title;
    dto.description = service.description;
    dto.image = service.imageFile
      ? FileResponseDto.fromEntity(service.imageFile)
      : null;
    dto.price = MoneyService.format(service.price);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
