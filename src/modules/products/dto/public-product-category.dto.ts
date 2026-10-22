import { ApiProperty } from '@nestjs/swagger';
import { ProductCategory } from '@prisma/client';

export class PublicProductCategoryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  static fromEntity(category: ProductCategory): PublicProductCategoryDto {
    const dto = new PublicProductCategoryDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.description = category.description;
    return dto;
  }
}
