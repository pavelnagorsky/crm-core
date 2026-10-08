import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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
  @IsNotEmpty()
  @MaxLength(100)
  idempotencyKey: string;
}
