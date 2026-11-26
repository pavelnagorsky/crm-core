import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsQuantity } from '../../../shared/decorators/is-quantity.decorator.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';

export class OrderProductItemDto {
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
      'Discount of the line (docs/pricing-stage7-api.md). Not sent: the stored choice stays (AUTO for a new line). NONE, RULE, CLIENT_DISCOUNT and any change of a non-AUTO choice need sale.price.override:write (403). A picked discount that does not apply: 409 PROMOTION_NOT_APPLICABLE { lineIndex, ruleId, reason, productId }.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionChoiceDto)
  promotion?: PromotionChoiceDto;
}
