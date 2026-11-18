import { ApiProperty } from '@nestjs/swagger';
import { StaffPopularServices } from '../interfaces/staff-popular-services.interface.js';
import { BookingFrequencyItemDto } from './booking-frequency-item.dto.js';

export class StaffPopularServicesDto {
  @ApiProperty({ type: String, format: 'uuid' })
  staffId: string;

  @ApiProperty({
    type: () => BookingFrequencyItemDto,
    isArray: true,
    description:
      'Up to 6 services and bundles, most frequent first, then most recent. A bundle visit counts for the bundle, not for its services',
  })
  items: BookingFrequencyItemDto[];

  static fromEntity(entry: StaffPopularServices): StaffPopularServicesDto {
    return Object.assign(new StaffPopularServicesDto(), {
      staffId: entry.staffId,
      items: entry.items.map(BookingFrequencyItemDto.fromEntity),
    });
  }
}
