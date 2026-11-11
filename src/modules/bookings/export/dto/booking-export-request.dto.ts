import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../../../shared/time/decorators/is-calendar-date.validator.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { toUuidArray } from '../../dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from '../../enums/booking-search-order-by.enum.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { catalogItemIdsDescription } from '../../utils/catalog-item-filter.js';

export class BookingExportRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description:
      'Client name, phone, email, service title, staff name, notes, internal notes, cancellation reason',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ enum: BookingStatus, required: false })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    required: false,
    description:
      'Filter by staff. Repeat the key: ?staffIds=UUID1&staffIds=UUID2. A single value is accepted as a one-element array.',
  })
  @IsOptional()
  @Transform(({ value }) => toUuidArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  staffIds?: string[];

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    required: false,
    description: catalogItemIdsDescription,
  })
  @IsOptional()
  @Transform(({ value }) => toUuidArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  catalogItemIds?: string[];

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  startFrom?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  startTo?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'First start day (YYYY-MM-DD) in the location timezone, inclusive',
  })
  @IsOptional()
  @IsCalendarDate()
  startDateFrom?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'Last start day (YYYY-MM-DD) in the location timezone, inclusive',
  })
  @IsOptional()
  @IsCalendarDate()
  startDateTo?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'First creation day (YYYY-MM-DD) in the location timezone, inclusive',
  })
  @IsOptional()
  @IsCalendarDate()
  createdDateFrom?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'Last creation day (YYYY-MM-DD) in the location timezone, inclusive',
  })
  @IsOptional()
  @IsCalendarDate()
  createdDateTo?: string;

  @ApiProperty({ enum: BookingSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(BookingSearchOrderBy)
  orderBy?: BookingSearchOrderBy;

  @ApiProperty({ enum: OrderDirection, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection;
}
