import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceImportResult } from '../interfaces/service-price-import-result.interface.js';
import { ServicePriceChangeSummaryDto } from './service-price-change-summary.dto.js';

export class ServicePriceImportResultDto {
  @ApiProperty({
    type: () => ServicePriceChangeSummaryDto,
    nullable: true,
    description: 'The stored price change; null when no price changed.',
  })
  change: ServicePriceChangeSummaryDto | null;

  @ApiProperty({ type: Number })
  createdServicesCount: number;

  @ApiProperty({ type: Number })
  createdCategoriesCount: number;

  @ApiProperty({
    type: Number,
    description: 'Equals createdServicesCount: new services have no staff yet.',
  })
  createdServicesWithoutStaffCount: number;

  @ApiProperty({ type: String, isArray: true })
  createdServiceIds: string[];

  static fromResult(result: ServicePriceImportResult): ServicePriceImportResultDto {
    const dto = new ServicePriceImportResultDto();
    dto.change = result.change
      ? ServicePriceChangeSummaryDto.fromView(result.change)
      : null;
    dto.createdServicesCount = result.createdServicesCount;
    dto.createdCategoriesCount = result.createdCategoriesCount;
    dto.createdServicesWithoutStaffCount = result.createdServicesCount;
    dto.createdServiceIds = result.createdServiceIds;
    return dto;
  }
}
