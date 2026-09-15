import { ApiProperty } from '@nestjs/swagger';
import { Service, ServiceCategory } from '@prisma/client';
import { PublicServiceItemDto } from './public-service-item.dto.js';

export class PublicServiceCategoryDto {
  @ApiProperty({ type: String, nullable: true })
  id: string | null;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: () => PublicServiceItemDto, isArray: true })
  services: PublicServiceItemDto[];

  static fromEntity(
    category: ServiceCategory & { services: Service[] },
  ): PublicServiceCategoryDto {
    const dto = new PublicServiceCategoryDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.services = category.services.map(PublicServiceItemDto.fromEntity);
    return dto;
  }

  static uncategorized(services: Service[]): PublicServiceCategoryDto {
    const dto = new PublicServiceCategoryDto();
    dto.id = null;
    dto.name = null;
    dto.services = services.map(PublicServiceItemDto.fromEntity);
    return dto;
  }
}
