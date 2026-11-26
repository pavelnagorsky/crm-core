import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { OrderPromoCodeField } from '../decorators/order-promo-code-field.decorator.js';
import { OrderPricingItemDto } from './order-pricing-item.dto.js';

export class OrderPricingRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description:
      'Order being edited (a sale or a visit order): its context and its confirmed lines.',
  })
  @IsOptional()
  @IsUUID()
  orderId?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description:
      'Booking whose products are priced (with or without an order): the booking context. With orderId of another booking: 400 VALIDATION_ERROR.',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description:
      'Client of a sale; ignored for a visit. Not sent: the client of the order (orderId).',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description:
      'Sale moment of a new sale confirmed immediately; otherwise the sale moment is now.',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @OrderPromoCodeField(
    'Promo code of a sale. Not sent: Order.promoCode of orderId; null: no code. With a booking context: 409 ORDER_PROMO_CODE_VIA_BOOKING.',
  )
  promoCode?: string | null;

  @ApiProperty({
    type: () => OrderPricingItemDto,
    isArray: true,
    description: 'The whole desired set of draft lines, 0..200.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderPricingItemDto)
  items: OrderPricingItemDto[];
}
