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
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { PaymentDetailsDto } from '../../payments/dto/payment-details.dto.js';

export class ConfirmOrderItemsDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds: string[];

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
