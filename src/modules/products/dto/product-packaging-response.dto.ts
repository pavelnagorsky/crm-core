import { ApiProperty } from '@nestjs/swagger';
import { ProductPackaging } from '@prisma/client';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';

export class ProductPackagingResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, format: 'decimal', example: '30.000' })
  quantityInBaseUnit: string;

  @ApiProperty({ type: Boolean })
  isActive: boolean;

  static fromEntity(entity: ProductPackaging): ProductPackagingResponseDto {
    return Object.assign(new ProductPackagingResponseDto(), {
      id: entity.id,
      name: entity.name,
      quantityInBaseUnit: QuantityService.format(entity.quantityInBaseUnit),
      isActive: entity.isActive,
    });
  }
}
