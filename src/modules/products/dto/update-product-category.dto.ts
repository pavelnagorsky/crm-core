import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateProductCategoryDto {
  @ApiProperty({ type: String, maxLength: 150, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiProperty({
    type: String,
    maxLength: 500,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
