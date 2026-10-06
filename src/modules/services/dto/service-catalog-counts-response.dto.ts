import { ApiProperty } from '@nestjs/swagger';
import { ServiceCatalogCounts } from '../interfaces/service-catalog-counts.interface.js';
import { ServiceCatalogKindCountDto } from './service-catalog-kind-count.dto.js';
import { ServiceCatalogStatusCountDto } from './service-catalog-status-count.dto.js';

export class ServiceCatalogCountsResponseDto {
  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: () => ServiceCatalogStatusCountDto, isArray: true })
  byStatus: ServiceCatalogStatusCountDto[];

  @ApiProperty({ type: () => ServiceCatalogKindCountDto, isArray: true })
  byKind: ServiceCatalogKindCountDto[];

  static fromCounts(
    counts: ServiceCatalogCounts,
  ): ServiceCatalogCountsResponseDto {
    const dto = new ServiceCatalogCountsResponseDto();
    dto.total = counts.total;
    dto.byStatus = counts.byStatus.map((row) => {
      const status = new ServiceCatalogStatusCountDto();
      status.status = row.status;
      status.count = row.count;
      return status;
    });
    dto.byKind = counts.byKind.map((row) => {
      const kind = new ServiceCatalogKindCountDto();
      kind.kind = row.kind;
      kind.count = row.count;
      return kind;
    });
    return dto;
  }
}
