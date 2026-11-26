import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsQuantity } from '../../../shared/decorators/is-quantity.decorator.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';

export class ManualBookingProductDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  productId: string;

  @IsQuantity()
  quantity: string;

  @IsOptionalPrice()
  customUnitPrice?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sellerStaffId?: string | null;

  @ApiProperty({
    type: () => PromotionChoiceDto,
    required: false,
    description:
      'Discount of the product line, cabinet only (docs/pricing-stage7-api.md): AUTO by default; NONE, RULE and CLIENT_DISCOUNT need sale.price.override:write.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionChoiceDto)
  promotion?: PromotionChoiceDto;
}
