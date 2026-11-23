import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePriceLevelDto {
  @ApiProperty({ type: String, required: false, minLength: 1, maxLength: 60 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @ApiProperty({
    type: Boolean,
    required: false,
    enum: [true],
    description:
      'Only true: makes the level the default one. The previous default level stops being the default.',
  })
  @IsOptional()
  @Equals(true)
  isDefault?: true;
}
