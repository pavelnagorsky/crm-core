import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceLevelMatrixPrice } from '../interfaces/price-level-matrix-price.interface.js';

export class PriceLevelMatrixPriceDto {
  @ApiProperty({ type: String })
  levelId: string;

  @ApiPrice({
    nullable: true,
    description: 'Own price of the level; null: the base price applies.',
  })
  price: string | null;

  static fromPrice(item: PriceLevelMatrixPrice): PriceLevelMatrixPriceDto {
    const dto = new PriceLevelMatrixPriceDto();
    dto.levelId = item.levelId;
    dto.price = item.price === null ? null : MoneyUtils.format(item.price);
    return dto;
  }
}
