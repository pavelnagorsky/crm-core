import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';

export class CreateServiceDto {
  @ApiProperty({ type: String, maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiProperty({ type: String, maxLength: 2000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsPrice()
  price: string;

  @ApiProperty({ type: Number, description: 'Duration in minutes' })
  @IsInt()
  @Min(1)
  durationMinutes: number;

  @ApiProperty({ type: Number, required: false, default: 0, description: 'Buffer time in minutes after service' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bufferMinutes?: number;

  @ApiProperty({ type: Boolean, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: Number, required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
