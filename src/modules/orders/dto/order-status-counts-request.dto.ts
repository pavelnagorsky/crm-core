import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';

export class OrderStatusCountsRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'First order day (YYYY-MM-DD) in the location timezone, inclusive. Filters by occurredAt',
  })
  @IsOptional()
  @IsCalendarDate()
  dateFrom?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'Last order day (YYYY-MM-DD) in the location timezone, inclusive. Filters by occurredAt',
  })
  @IsOptional()
  @IsCalendarDate()
  dateTo?: string;
}
