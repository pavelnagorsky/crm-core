import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';
import { PromotionChoiceDto } from '../../pricing/dto/promotion-choice.dto.js';

export class UpdateBookingItemPriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id: string;

  @IsNullablePrice()
  customPrice: string | null;

  @ApiProperty({
    type: () => PromotionChoiceDto,
    required: false,
    description:
      'Pick the discount of the item again: the item gets fresh price layers at its final staff and time (after a move in the same request; send its current customPrice too), and the pick is stored (discountChoice). Missing: the stored layers and pick are kept.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionChoiceDto)
  promotion?: PromotionChoiceDto;
}
