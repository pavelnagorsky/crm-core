import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';

export class ServicePriceImportLevelPriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  levelId: string;

  @ApiProperty({ type: String })
  levelName: string;

  @ApiPrice()
  price: string;
}
