import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsSignedQuantity } from '../../../shared/decorators/is-signed-quantity.decorator.js';

export class InventoryDocumentItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  productId: string;

  @IsSignedQuantity()
  quantity: string;

  @IsOptional()
  @IsOptionalPrice()
  unitCost?: string | null;
}
