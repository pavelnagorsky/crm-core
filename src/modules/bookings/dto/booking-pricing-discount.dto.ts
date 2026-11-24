import { ApiProperty } from '@nestjs/swagger';
import { PriceAdjustmentKind, PriceValueType } from '@prisma/client';
import {
  ApiDecimal,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServicePriceAdjustment } from '../../pricing/interfaces/service-price-adjustment.interface.js';

/** The discount of a priced line: a promotion or the client discount. */
export class BookingPricingDiscountDto {
  @ApiProperty({
    enum: [PriceAdjustmentKind.PROMOTION, PriceAdjustmentKind.CLIENT_DISCOUNT],
    enumName: 'PriceAdjustmentKind',
  })
  kind: PriceAdjustmentKind;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Promotion; null for the client discount.',
  })
  ruleId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Internal name; null in public responses.',
  })
  title: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Name for the client (the client discount: "Ваша скидка"). Public responses show only discounts that have one.',
  })
  publicTitle: string | null;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiDecimal({ description: 'Percent or amount by valueType.' })
  value: string;

  @ApiSignedAmount({ description: 'Change of the line price, negative.' })
  amount: string;

  static fromAdjustment(
    adjustment: ServicePriceAdjustment,
    cabinet: boolean,
  ): BookingPricingDiscountDto {
    const dto = new BookingPricingDiscountDto();
    dto.kind = adjustment.kind;
    dto.ruleId = adjustment.ruleId;
    dto.title = cabinet ? adjustment.title : null;
    dto.publicTitle = adjustment.publicTitle;
    dto.valueType = adjustment.valueType as PriceValueType;
    dto.value = MoneyUtils.format(adjustment.value ?? MoneyUtils.decimal(0));
    dto.amount = MoneyUtils.format(adjustment.amount);
    return dto;
  }
}
