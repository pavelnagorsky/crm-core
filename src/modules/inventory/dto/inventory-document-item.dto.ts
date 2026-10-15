import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { IsOptionalQuantity } from '../../../shared/decorators/is-quantity.decorator.js';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsSignedQuantity } from '../../../shared/decorators/is-signed-quantity.decorator.js';

export class InventoryDocumentItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({
    type: String,
    format: 'decimal',
    required: false,
    description:
      'Quantity in base units. Required when packagingId is omitted.',
  })
  @ValidateIf(
    (item: InventoryDocumentItemDto) =>
      item.packagingId == null || item.quantity != null,
  )
  @IsSignedQuantity()
  quantity?: string;

  @IsOptional()
  @IsOptionalPrice()
  unitCost?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description:
      'Receipt only. Use packageQuantity and packageUnitCost instead of quantity and unitCost.',
  })
  @IsOptional()
  @IsUUID()
  packagingId?: string | null;

  @IsOptionalQuantity()
  packageQuantity?: string;

  @IsOptionalPrice()
  packageUnitCost?: string;
}
