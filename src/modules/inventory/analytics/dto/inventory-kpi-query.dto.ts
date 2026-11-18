import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsOptionalProductPurpose } from '../../../products/decorators/is-optional-product-purpose.decorator.js';
import { ProductPurpose } from '../../../products/enums/product-purpose.enum.js';

export class InventoryKpiQueryDto {
  @ApiProperty({ type: Number, default: 90, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deadStockDays: number = 90;

  @ApiProperty({ type: Number, default: 30, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  movementDays: number = 30;

  @ApiProperty({ type: Number, default: 5, maximum: 20, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topLimit: number = 5;

  @IsOptionalProductPurpose()
  purpose?: ProductPurpose;
}
