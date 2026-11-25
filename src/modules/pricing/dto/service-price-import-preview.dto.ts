import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceImportPreview } from '../interfaces/service-price-import-preview.interface.js';
import { ServicePriceChangeConflictDto } from './service-price-change-conflict.dto.js';
import { ServicePriceChangeGroupDto } from './service-price-change-group.dto.js';
import { ServicePriceImportCountsDto } from './service-price-import-counts.dto.js';
import { ServicePriceImportErrorDto } from './service-price-import-error.dto.js';
import { ServicePriceImportNewServiceDto } from './service-price-import-new-service.dto.js';

export class ServicePriceImportPreviewDto {
  @ApiProperty({
    type: String,
    example: '2027-01-01',
    description: 'The effective date, or the location today for "now".',
  })
  date: string;

  @ApiProperty({ type: () => ServicePriceImportNewServiceDto, isArray: true })
  newServices: ServicePriceImportNewServiceDto[];

  @ApiProperty({
    type: () => ServicePriceChangeGroupDto,
    isArray: true,
    description:
      'Price changes: same rows as the price change preview, all checked.',
  })
  priceChanges: ServicePriceChangeGroupDto[];

  @ApiProperty({
    type: () => ServicePriceImportErrorDto,
    isArray: true,
    description: 'The first 200 errors.',
  })
  errors: ServicePriceImportErrorDto[];

  @ApiProperty({
    type: Number,
    description: 'All errors, not only the listed ones.',
  })
  errorCount: number;

  @ApiProperty({ type: () => ServicePriceImportCountsDto })
  counts: ServicePriceImportCountsDto;

  @ApiProperty({ type: Number })
  affectedBookingsCount: number;

  @ApiProperty({ type: () => ServicePriceChangeConflictDto, isArray: true })
  conflicts: ServicePriceChangeConflictDto[];

  @ApiProperty({
    type: Boolean,
    description: 'No errors and something to apply.',
  })
  canApply: boolean;

  static fromPreview(
    preview: ServicePriceImportPreview,
  ): ServicePriceImportPreviewDto {
    const dto = new ServicePriceImportPreviewDto();
    dto.date = preview.date;
    dto.newServices = preview.newServices.map(
      ServicePriceImportNewServiceDto.fromNewService,
    );
    dto.priceChanges = preview.groups.map(ServicePriceChangeGroupDto.fromGroup);
    dto.errors = preview.errors.map(ServicePriceImportErrorDto.fromEntry);
    dto.errorCount = preview.errorCount;
    dto.counts = ServicePriceImportCountsDto.fromCounts(preview.counts);
    dto.affectedBookingsCount = preview.affectedBookingsCount;
    dto.conflicts = preview.conflicts.map(
      ServicePriceChangeConflictDto.fromConflict,
    );
    dto.canApply = preview.canApply;
    return dto;
  }
}
