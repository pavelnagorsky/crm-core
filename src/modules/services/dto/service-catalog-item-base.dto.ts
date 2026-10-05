import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';
import { ServiceCatalogItem } from '../interfaces/service-catalog-item.js';

export class ServiceCatalogItemBaseDto {
  @ApiProperty({ type: String })
  id: string;

  kind: ServiceCatalogKind;

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

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus' })
  status: ServiceStatus;

  @ApiProperty({ type: Number })
  sortOrder: number;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static assign(dto: ServiceCatalogItemBaseDto, item: ServiceCatalogItem): void {
    dto.id = item.id;
    dto.kind = item.kind;
    dto.businessId = item.businessId;
    dto.categoryId = item.categoryId;
    dto.image = item.imageFile ? FileResponseDto.fromEntity(item.imageFile) : null;
    dto.title = item.title;
    dto.description = item.description;
    dto.price = MoneyService.format(item.price);
    dto.durationMinutes = item.durationMinutes;
    dto.status = item.status;
    dto.sortOrder = item.sortOrder;
    dto.createdAt = item.createdAt;
    dto.updatedAt = item.updatedAt;
  }
}
