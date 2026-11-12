import { ApiProperty } from '@nestjs/swagger';
import { BookingVisitService } from '../../bookings/visits/interfaces/booking-visit-service.interface.js';

export class ReviewVisitServiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Name at the time of the visit' })
  name: string;

  static fromEntity(service: BookingVisitService): ReviewVisitServiceDto {
    return Object.assign(new ReviewVisitServiceDto(), {
      id: service.id,
      name: service.name,
    });
  }
}
