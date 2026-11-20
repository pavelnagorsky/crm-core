import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';

export class PayBookingDto extends PaymentInputDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description:
      'Draft PRODUCT lines of the visit order to confirm (sell) before the payment, so it covers them. Needs order:write. Unknown line: 404 ORDER_ITEM_NOT_FOUND; not a draft product: 409 ORDER_ITEM_NOT_DRAFT; 409 ORDER_PRODUCT_NOT_SELLABLE, ORDER_SELLER_INVALID. NO_SHOW or CANCELLED booking: 409 BOOKING_PAYMENT_NOT_ALLOWED.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  confirmProductItemIds?: string[];
}
