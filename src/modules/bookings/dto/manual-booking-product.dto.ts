import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsQuantity } from '../../../shared/decorators/is-quantity.decorator.js';

export class ManualBookingProductDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  productId: string;

  @IsQuantity()
  quantity: string;

  @IsOptionalPrice()
  customUnitPrice?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sellerStaffId?: string | null;
}
