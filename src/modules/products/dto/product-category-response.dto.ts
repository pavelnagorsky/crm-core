import { ApiProperty } from '@nestjs/swagger';
import { ProductCategory } from '@prisma/client';

export class ProductCategoryResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(category: ProductCategory): ProductCategoryResponseDto {
    return Object.assign(new ProductCategoryResponseDto(), category);
  }
}
