import { ApiProperty } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';

export class ServiceCategoryResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  static fromEntity(category: ServiceCategory): ServiceCategoryResponseDto {
    const dto = new ServiceCategoryResponseDto();
    dto.id = category.id;
    dto.businessId = category.businessId;
    dto.name = category.name;
    dto.description = category.description;
    dto.sortOrder = category.sortOrder;
    dto.createdAt = category.createdAt;
    return dto;
  }
}
