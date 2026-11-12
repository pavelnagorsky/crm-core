import { ApiProperty } from '@nestjs/swagger';
import { BookingVisit } from '../../bookings/visits/interfaces/booking-visit.interface.js';
import { ReviewVisitServiceDto } from './review-visit-service.dto.js';

export class ReviewVisitDto {
  @ApiProperty({ description: 'Start of the visit, UTC' })
  startAt: Date;

  @ApiProperty({
    type: () => ReviewVisitServiceDto,
    isArray: true,
    description:
      'Services of the visit in booking order; a bundle is listed by its services',
  })
  services: ReviewVisitServiceDto[];

  static fromEntity(visit: BookingVisit): ReviewVisitDto {
    return Object.assign(new ReviewVisitDto(), {
      startAt: visit.startAt,
      services: visit.services.map(ReviewVisitServiceDto.fromEntity),
    });
  }
}
