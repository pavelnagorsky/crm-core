import { ApiProperty } from '@nestjs/swagger';
import { PriceAdjustmentKind } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServiceDiscountOption } from '../../pricing/interfaces/service-discount-option.interface.js';

/** A discount that applies to a line, for the menu of the booking dialog. */
export class BookingPricingDiscountOptionDto {
  @ApiProperty({
    enum: [PriceAdjustmentKind.PROMOTION, PriceAdjustmentKind.CLIENT_DISCOUNT],
    enumName: 'PriceAdjustmentKind',
  })
  kind: PriceAdjustmentKind;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  ruleId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiPrice({ description: 'Discount, positive.' })
  amount: string;

  @ApiPrice({ description: 'Line price with this discount.' })
  chargedPrice: string;

  static fromOption(
    option: ServiceDiscountOption,
  ): BookingPricingDiscountOptionDto {
    const dto = new BookingPricingDiscountOptionDto();
    dto.kind = option.kind;
    dto.ruleId = option.ruleId;
    dto.title = option.title;
    dto.amount = MoneyUtils.format(option.amount);
    dto.chargedPrice = MoneyUtils.format(option.chargedPrice);
    return dto;
  }
}
