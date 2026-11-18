import { ApiProperty } from '@nestjs/swagger';
import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';
import { BookingFrequency } from '../interfaces/booking-frequency.interface.js';

export class BookingFrequencyItemDto {
  @ApiProperty({ enum: ServiceCatalogKind, enumName: 'ServiceCatalogKind' })
  kind: ServiceCatalogKind;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Service id for SERVICE, bundle id for BUNDLE',
  })
  id: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'Location of the service or bundle; every service and bundle belongs to one location',
  })
  locationId: string;

  @ApiProperty({
    type: String,
    description:
      'SERVICE: title as booked last time, kept after the service is renamed or removed. BUNDLE: current title, empty when the bundle was deleted',
  })
  title: string;

  @ApiProperty({
    type: Number,
    description: 'Completed visits that included it',
  })
  count: number;

  @ApiProperty({
    type: Date,
    description: 'Start of the latest such visit, UTC',
  })
  lastAt: Date;

  static fromEntity(frequency: BookingFrequency): BookingFrequencyItemDto {
    return Object.assign(new BookingFrequencyItemDto(), {
      kind: frequency.kind,
      id: frequency.id,
      locationId: frequency.locationId,
      title: frequency.title,
      count: frequency.count,
      lastAt: frequency.lastAt,
    });
  }
}
