import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from '../../reviews/dto/review-response.dto.js';
import { ReviewWithStaff } from '../../reviews/interfaces/review-with-staff.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { VisitPaymentSummary } from '../interfaces/visit-payment-summary.interface.js';
import { BookingPaymentDto } from './booking-payment.dto.js';
import { BookingResponseDto } from './booking-response.dto.js';

/** Booking card in the staff panel: the booking, its payment and the client's review. */
export class BookingDetailsResponseDto extends BookingResponseDto {
  @ApiProperty({
    type: () => ReviewResponseDto,
    nullable: true,
    description:
      'Review of this visit, hidden ones included. Null when there is none or the user lacks review:read',
  })
  review: ReviewResponseDto | null;

  @ApiProperty({
    type: () => BookingPaymentDto,
    description:
      'Payment of the visit. The authoritative amount due of a visit: services by the booking plus sold products.',
  })
  payment: BookingPaymentDto;

  static fromBooking(
    booking: BookingWithItems,
    review: ReviewWithStaff | null,
    payment: VisitPaymentSummary,
  ): BookingDetailsResponseDto {
    return Object.assign(new BookingDetailsResponseDto(), {
      ...BookingResponseDto.fromEntity(booking),
      review: review ? ReviewResponseDto.fromEntity(review) : null,
      payment: BookingPaymentDto.fromSummary(payment),
    });
  }
}
