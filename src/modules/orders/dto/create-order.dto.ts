import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { OrderPromoCodeField } from '../decorators/order-promo-code-field.decorator.js';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto.js';
import { OrderProductItemDto } from './order-product-item.dto.js';

export class CreateOrderDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(1000)
  note?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'Create and confirm all product items atomically.',
  })
  @IsOptional()
  @IsBoolean()
  confirmImmediately?: boolean;

  @ApiProperty({
    type: String,
    maxLength: 100,
    required: false,
    nullable: true,
    description:
      'Required when confirmImmediately is true. Reuse for retries of the same sale. A different request with the same key returns ORDER_IDEMPOTENCY_CONFLICT (409).',
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(100)
  idempotencyKey?: string | null;

  @OrderPromoCodeField(
    'Promo code of the sale, stored as entered even when it does not apply now (the draft is priced again on every write). The result is promoCode of POST orders/pricing.',
  )
  promoCode?: string | null;

  @IsOptionalPrice(
    'Required with confirmImmediately (400 VALIDATION_ERROR), ignored otherwise: totalAmount of POST orders/pricing the user saw. A different total at confirmation is 409 PRICE_CHANGED { expectedTotal, total, products, promoCode }; nothing is stored. Part of the sale request hash.',
  )
  expectedTotal?: string | null;

  @ApiProperty({ type: () => OrderProductItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderProductItemDto)
  items: OrderProductItemDto[];

  @ApiProperty({
    type: () => PaymentDetailsDto,
    required: false,
    description:
      'How the client paid for the sale. Only with confirmImmediately: true (400 otherwise). Recorded atomically with the sale under its idempotencyKey and part of the sale request hash. Amount due: the sale total.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  payment?: PaymentDetailsDto;
}
