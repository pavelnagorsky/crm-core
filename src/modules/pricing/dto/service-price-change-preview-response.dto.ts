import { ApiProperty } from '@nestjs/swagger';
import { PriceChangePreview } from '../interfaces/price-change-preview.interface.js';
import { ServicePriceChangeConflictDto } from './service-price-change-conflict.dto.js';
import { ServicePriceChangeCountsDto } from './service-price-change-counts.dto.js';
import { ServicePriceChangeGroupDto } from './service-price-change-group.dto.js';

export class ServicePriceChangePreviewResponseDto {
  @ApiProperty({
    type: String,
    example: '2027-01-01',
    description: 'The effective date, or the location today for "now".',
  })
  date: string;

  @ApiProperty({ type: () => ServicePriceChangeGroupDto, isArray: true })
  groups: ServicePriceChangeGroupDto[];

  @ApiProperty({ type: () => ServicePriceChangeCountsDto })
  counts: ServicePriceChangeCountsDto;

  @ApiProperty({
    type: Number,
    description:
      'Pending and confirmed bookings from the date on for these services; they keep their price. 0 without a date.',
  })
  affectedBookingsCount: number;

  @ApiProperty({
    type: () => ServicePriceChangeConflictDto,
    isArray: true,
    description:
      'Scheduled changes on the same date with the same services: creating is a 409.',
  })
  conflicts: ServicePriceChangeConflictDto[];

  static fromPreview(
    preview: PriceChangePreview,
  ): ServicePriceChangePreviewResponseDto {
    const dto = new ServicePriceChangePreviewResponseDto();
    dto.date = preview.date;
    dto.groups = preview.groups.map(ServicePriceChangeGroupDto.fromGroup);
    dto.counts = ServicePriceChangeCountsDto.fromCounts(preview.counts);
    dto.affectedBookingsCount = preview.affectedBookingsCount;
    dto.conflicts = preview.conflicts.map(
      ServicePriceChangeConflictDto.fromConflict,
    );
    return dto;
  }
}
