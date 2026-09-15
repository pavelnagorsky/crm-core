import { ApiProperty } from '@nestjs/swagger';
import { Service } from '@prisma/client';

export class ServiceResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: Number })
  price: number;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({ type: Number })
  bufferMinutes: number;

  @ApiProperty({ type: Boolean })
  isActive: boolean;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(service: Service): ServiceResponseDto {
    const dto = new ServiceResponseDto();
    dto.id = service.id;
    dto.businessId = service.businessId;
    dto.categoryId = service.categoryId;
    dto.title = service.title;
    dto.description = service.description;
    dto.price = Number(service.price);
    dto.durationMinutes = service.durationMinutes;
    dto.bufferMinutes = service.bufferMinutes;
    dto.isActive = service.isActive;
    dto.sortOrder = service.sortOrder;
    dto.createdAt = service.createdAt;
    dto.updatedAt = service.updatedAt;
    return dto;
  }
}
