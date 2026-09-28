import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { toUuidArray } from '../../dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from '../../enums/booking-search-order-by.enum.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';

export class BookingExportRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Client name, phone, email, service title, staff name, notes, internal notes, cancellation reason',
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
    description: 'Filter by staff. Repeat the key: ?staffIds=UUID1&staffIds=UUID2. A single value is accepted as a one-element array.',
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
    description: 'Filter by service. Repeat the key: ?serviceIds=UUID1&serviceIds=UUID2. A single value is accepted as a one-element array.',
  })
  @IsOptional()
  @Transform(({ value }) => toUuidArray(value))
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

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

  @ApiProperty({ enum: BookingSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(BookingSearchOrderBy)
  orderBy?: BookingSearchOrderBy;

  @ApiProperty({ enum: OrderDirection, required: false })
  @IsOptional()
  @IsEnum(OrderDirection)
  orderDirection?: OrderDirection;
}
