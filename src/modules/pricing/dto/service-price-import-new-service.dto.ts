import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ServicePriceNewService } from '../interfaces/service-price-new-service.interface.js';
import { ServicePriceImportLevelPriceDto } from './service-price-import-level-price.dto.js';

/** A service the file would create. */
export class ServicePriceImportNewServiceDto {
  @ApiProperty({ type: Number, description: 'Row number as in Excel.' })
  row: number;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiProperty({ type: Boolean })
  categoryWillBeCreated: boolean;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({
    type: () => ServicePriceImportLevelPriceDto,
    isArray: true,
    description: 'Only the filled level columns.',
  })
  levelPrices: ServicePriceImportLevelPriceDto[];

  static fromNewService(
    item: ServicePriceNewService,
  ): ServicePriceImportNewServiceDto {
    const dto = new ServicePriceImportNewServiceDto();
    dto.row = item.row;
    dto.categoryName = item.categoryName;
    dto.categoryWillBeCreated = item.categoryWillBeCreated;
    dto.title = item.title;
    dto.durationMinutes = item.durationMinutes;
    dto.price = item.price;
    dto.description = item.description;
    dto.levelPrices = item.levelPrices.map((level) => ({ ...level }));
    return dto;
  }
}
