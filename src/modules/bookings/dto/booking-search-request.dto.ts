import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { catalogItemIdsDescription } from '../utils/catalog-item-filter.js';
import { BookingSearchOrderBy } from '../enums/booking-search-order-by.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingChannel } from '../enums/booking-channel.enum.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import {
  TRAFFIC_DETAIL_MAX_LENGTH,
  UTM_CAMPAIGN_MAX_LENGTH,
} from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

export function toUuidArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const items = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== '' && item != null,
  );
  return items.length ? items : undefined;
}

export class BookingSearchRequestDto extends PaginationRequestDto<BookingSearchOrderBy> {
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

  @ApiProperty({
    enum: BookingChannel,
    enumName: 'BookingChannel',
    isArray: true,
    required: false,
    description:
      'Only bookings made through these channels. Repeat the key: ?channels=PUBLIC_PAGE&channels=WIDGET',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(BookingChannel, { each: true })
  channels?: BookingChannel[];

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    isArray: true,
    required: false,
    description:
      'Only bookings from these sources. With trafficSourceNotSet, also bookings without a source.',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(TrafficSource, { each: true })
  trafficSources?: TrafficSource[];

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true: bookings without a source (manual ones where staff picked none); combined with trafficSources by OR',
  })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  trafficSourceNotSet?: boolean;

  @ApiProperty({
    type: String,
    maxLength: TRAFFIC_DETAIL_MAX_LENGTH,
    required: false,
    description: 'Source detail, exact match ignoring case',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRAFFIC_DETAIL_MAX_LENGTH)
  trafficSourceDetail?: string;

  @ApiProperty({
    type: String,
    maxLength: UTM_CAMPAIGN_MAX_LENGTH,
    required: false,
    description: 'utm_campaign of the online visit, exact match ignoring case',
  })
  @IsOptional()
  @IsString()
  @MaxLength(UTM_CAMPAIGN_MAX_LENGTH)
  utmCampaign?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true: only first bookings of a client in the brand (the booking that acquired the client)',
  })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  newClientsOnly?: boolean;

  @ApiProperty({ enum: BookingSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(BookingSearchOrderBy)
  declare orderBy?: BookingSearchOrderBy;
}
