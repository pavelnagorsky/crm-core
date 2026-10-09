import { ApiProperty } from '@nestjs/swagger';
import { ProductStatus } from '../enums/product-status.enum.js';

export class ProductStatusCountResponseDto {
  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus' })
  status: ProductStatus;

  @ApiProperty({ type: Number })
  count: number;
}
