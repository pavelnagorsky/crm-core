import { ApiProperty } from '@nestjs/swagger';
import { ClientBookingSummary } from '../interfaces/client-booking-summary.interface.js';
import { ClientBookingVisit } from '../interfaces/client-booking-visit.interface.js';
import { BookingFrequencyItemDto } from './booking-frequency-item.dto.js';
import { ClientBookingVisitDto } from './client-booking-visit.dto.js';

export class ClientBookingSummaryResponseDto {
  @ApiProperty({
    type: Number,
    description: 'Completed visits in all active locations of the brand',
  })
  visits: number;

  @ApiProperty({
    type: Number,
    description: 'No-shows in all active locations of the brand',
  })
  noShows: number;

  @ApiProperty({
    type: () => ClientBookingVisitDto,
    nullable: true,
    description: 'Latest completed visit in any location of the brand',
  })
  lastVisit: ClientBookingVisitDto | null;

  @ApiProperty({
    type: () => ClientBookingVisitDto,
    nullable: true,
    description:
      'Latest completed visit in the requested location, for repeating its services. Same booking as lastVisit when that one was here',
  })
  lastLocationVisit: ClientBookingVisitDto | null;

  @ApiProperty({
    type: () => ClientBookingVisitDto,
    nullable: true,
    description:
      'Nearest PENDING or CONFIRMED booking starting after now, in any location of the brand',
  })
  upcoming: ClientBookingVisitDto | null;

  @ApiProperty({
    type: Number,
    description:
      'PENDING or CONFIRMED bookings starting after now, in all locations of the brand',
  })
  upcomingCount: number;

  @ApiProperty({
    type: () => BookingFrequencyItemDto,
    isArray: true,
    description:
      'Services of completed visits booked without a bundle, all locations of the brand, most frequent first, then most recent. At most 100',
  })
  services: BookingFrequencyItemDto[];

  @ApiProperty({
    type: () => BookingFrequencyItemDto,
    isArray: true,
    description:
      'Bundles of completed visits, all locations of the brand, most frequent first, then most recent. At most 100',
  })
  bundles: BookingFrequencyItemDto[];

  static fromSummary(
    summary: ClientBookingSummary,
  ): ClientBookingSummaryResponseDto {
    const visit = (value: ClientBookingVisit | null) =>
      value ? ClientBookingVisitDto.fromVisit(value) : null;
    return Object.assign(new ClientBookingSummaryResponseDto(), {
      visits: summary.visits,
      noShows: summary.noShows,
      lastVisit: visit(summary.lastVisit),
      lastLocationVisit: visit(summary.lastLocationVisit),
      upcoming: visit(summary.upcoming),
      upcomingCount: summary.upcomingCount,
      services: summary.services.map(BookingFrequencyItemDto.fromEntity),
      bundles: summary.bundles.map(BookingFrequencyItemDto.fromEntity),
    });
  }
}
