import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsQuantity } from '../../../shared/decorators/is-quantity.decorator.js';

export class CreateProductPackagingDto {
  @ApiProperty({ type: String, maxLength: 100, example: 'Box of 30' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsQuantity()
  quantityInBaseUnit: string;
}
