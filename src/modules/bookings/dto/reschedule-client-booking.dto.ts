import { ApiProperty } from '@nestjs/swagger';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { IsDateString } from 'class-validator';

export class RescheduleClientBookingDto {
  @ApiProperty({
    type: String,
    example: '2026-10-27T10:00:00',
    description:
      'New start in the location timezone. Services, staff, prices and durations are preserved.',
  })
  @IsLocalDateTime()
  @IsDateString({ strict: true })
  startAt: string;
}
