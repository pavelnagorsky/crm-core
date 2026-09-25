import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { ServiceWithImage } from '../services.service.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ServiceStatus } from '../enums/service-status.enum.js';

export class ServiceResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiPrice()
  price: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({ type: Number })
  bufferMinutes: number;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(service: ServiceWithImage): ServiceResponseDto {
    const dto = new ServiceResponseDto();
    dto.id = service.id;
    dto.businessId = service.businessId;
    dto.categoryId = service.categoryId;
    dto.image = service.imageFile
      ? FileResponseDto.fromEntity(service.imageFile)
      : null;
    dto.title = service.title;
    dto.description = service.description;
    dto.price = MoneyService.format(service.price);
    dto.durationMinutes = service.durationMinutes;
    dto.bufferMinutes = service.bufferMinutes;
    dto.status = service.status;
    dto.sortOrder = service.sortOrder;
    dto.createdAt = service.createdAt;
    dto.updatedAt = service.updatedAt;
    return dto;
  }
}
