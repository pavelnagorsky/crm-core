import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BulkFillItem } from '../interfaces/bulk-fill-item.interface.js';

const price = (value: BulkFillItem['currentPrice']): string | null =>
  value === null ? null : MoneyUtils.format(value);

export class PriceLevelFillItemDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  categoryName: string | null;

  @ApiPrice()
  basePrice: string;

  @ApiPrice({ nullable: true, description: 'Current price of the level.' })
  currentPrice: string | null;

  @ApiPrice({
    nullable: true,
    description: 'Price after the fill; null when the fill clears prices.',
  })
  newPrice: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'Preselected: the level has no price for the service yet.',
  })
  checked: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'The new price is not above zero; such a row cannot be applied.',
  })
  invalid: boolean;

  static fromItem(item: BulkFillItem): PriceLevelFillItemDto {
    const dto = new PriceLevelFillItemDto();
    dto.serviceId = item.serviceId;
    dto.title = item.title;
    dto.categoryName = item.categoryName;
    dto.basePrice = MoneyUtils.format(item.basePrice);
    dto.currentPrice = price(item.currentPrice);
    dto.newPrice = price(item.newPrice);
    dto.checked = item.checked;
    dto.invalid = item.invalid;
    return dto;
  }
}
