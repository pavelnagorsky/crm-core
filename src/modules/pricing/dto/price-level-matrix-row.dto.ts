import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceLevelMatrixRow } from '../interfaces/price-level-matrix-row.interface.js';
import { PriceLevelMatrixPriceDto } from './price-level-matrix-price.dto.js';

export class PriceLevelMatrixRowDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiPrice()
  basePrice: string;

  @ApiProperty({
    type: () => PriceLevelMatrixPriceDto,
    isArray: true,
    description: 'One entry per non-default level, in level order.',
  })
  prices: PriceLevelMatrixPriceDto[];

  static fromRow(item: PriceLevelMatrixRow): PriceLevelMatrixRowDto {
    const dto = new PriceLevelMatrixRowDto();
    dto.serviceId = item.serviceId;
    dto.title = item.title;
    dto.basePrice = MoneyUtils.format(item.basePrice);
    dto.prices = item.prices.map(PriceLevelMatrixPriceDto.fromPrice);
    return dto;
  }
}
