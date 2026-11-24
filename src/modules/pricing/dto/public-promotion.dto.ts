import { ApiProperty } from '@nestjs/swagger';
import { PriceValueType, PromotionClientFilter } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PublicPromotionView } from '../interfaces/public-promotion-view.interface.js';

/** A promotion on the booking page and in the widget; a promo code is never returned. */
export class PublicPromotionDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  publicName: string;

  @ApiProperty({ type: String, nullable: true })
  publicDescription: string | null;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiPrice({ description: 'Percent or amount by valueType.' })
  value: string;

  @ApiProperty({
    enum: PromotionClientFilter,
    enumName: 'PromotionClientFilter',
  })
  clientFilter: PromotionClientFilter;

  @ApiProperty({
    type: Boolean,
    description: 'Works only with its promo code (the code is not shown).',
  })
  requiresCode: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Conditions as clients read them.',
  })
  conditions: string[];

  static fromView(view: PublicPromotionView): PublicPromotionDto {
    const dto = new PublicPromotionDto();
    dto.id = view.id;
    dto.publicName = view.publicName;
    dto.publicDescription = view.publicDescription;
    dto.valueType = view.valueType;
    dto.value = MoneyUtils.format(view.value);
    dto.clientFilter = view.clientFilter;
    dto.requiresCode = view.requiresCode;
    dto.conditions = view.conditions;
    return dto;
  }
}
