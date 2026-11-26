import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto.js';

export class ConfirmOrderItemsDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds: string[];

  /**
   * Σ lineTotal of the confirmed lines the user saw (order or POST orders/pricing). The lines
   * are priced again with fresh data; a different total is 409 PRICE_CHANGED. Part of the hash.
   */
  @IsPrice()
  expectedTotal: string;

  @ApiProperty({
    type: String,
    maxLength: 100,
    description: 'Required idempotency key for this group confirmation.',
  })
  @IsString()
  @TrimString()
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;

  @ApiProperty({
    type: () => PaymentDetailsDto,
    required: false,
    description:
      'Record or change the sale payment in the same operation, for the sale total after confirmation. Sales only: a visit order is paid through its booking (409 ORDER_PAYMENT_VIA_BOOKING). Part of the request hash.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  payment?: PaymentDetailsDto;
}
