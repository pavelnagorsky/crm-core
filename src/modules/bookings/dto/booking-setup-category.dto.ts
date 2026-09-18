import { ApiProperty } from '@nestjs/swagger';
import { Service, ServiceCategory } from '@prisma/client';
import { BookingSetupServiceDto } from './booking-setup-service.dto.js';

export class BookingSetupCategoryDto {
  @ApiProperty({ type: String, nullable: true })
  id: string | null;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: () => BookingSetupServiceDto, isArray: true })
  services: BookingSetupServiceDto[];

  static fromEntity(category: ServiceCategory & { services: Service[] }): BookingSetupCategoryDto {
    const dto = new BookingSetupCategoryDto();
    dto.id = category.id;
    dto.name = category.name;
    dto.services = category.services.map(BookingSetupServiceDto.fromEntity);
    return dto;
  }

  static uncategorized(services: Service[]): BookingSetupCategoryDto {
    const dto = new BookingSetupCategoryDto();
    dto.id = null;
    dto.name = null;
    dto.services = services.map(BookingSetupServiceDto.fromEntity);
    return dto;
  }
}
