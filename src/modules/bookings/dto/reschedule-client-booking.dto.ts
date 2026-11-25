import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';
import { IsPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';

export class RescheduleClientBookingDto {
  @ApiProperty({
    type: String,
    example: '2026-10-27T10:00:00',
    description:
      'New start in the location timezone. Services, staff, custom prices and durations are preserved; the price is recalculated for this time.',
  })
  @IsLocalDateTime()
  @IsDateString({ strict: true })
  startAt: string;

  /** The price of the chosen slot (available-slots price); a different one is 409 PRICE_CHANGED. */
  @IsPrice()
  expectedTotal: string;
}
