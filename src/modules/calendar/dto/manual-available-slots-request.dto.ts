import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsDateRangeValid } from '../../staff/decorators/is-date-range-valid.decorator.js';
import { AvailableSlotsRequestDto } from './available-slots-request.dto.js';

@IsDateRangeValid()
export class ManualAvailableSlotsRequestDto extends AvailableSlotsRequestDto {
  @ApiProperty({
    type: String,
    example: '2026-10-01',
    description: 'Start date (inclusive) YYYY-MM-DD. Dates before today in the business timezone are ignored.',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    type: String,
    example: '2026-10-31',
    description: 'End date (inclusive) YYYY-MM-DD. The inclusive span cannot exceed 62 days.',
  })
  @IsDateString()
  to: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Booking being edited. Its linked calendar events are ignored while calculating available slots.',
  })
  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
