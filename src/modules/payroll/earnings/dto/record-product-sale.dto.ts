import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsPrice } from '../../../../shared/decorators/is-price.decorator.js';
import { TrimString } from '../../../../shared/transforms/trim-string.transform.js';

export class RecordProductSaleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  staffId: string;

  @IsPrice()
  amount: string;

  @ApiProperty({ type: String, example: '2026-09-15' })
  @IsDateString()
  soldOn: string;

  @ApiProperty({ type: String, maxLength: 100, description: 'External sale id used for idempotency' })
  @IsString()
  @MaxLength(100)
  externalId: string;

  @ApiProperty({ type: String, maxLength: 500 })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;
}
