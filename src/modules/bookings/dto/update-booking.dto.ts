import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { UpdateBookingItemPriceDto } from './update-booking-item-price.dto.js';
import { BookingItemStaffAssignmentDto } from './booking-item-staff-assignment.dto.js';

export class UpdateBookingDto {
  @ApiProperty({
    type: () => BookingItemStaffAssignmentDto,
    isArray: true,
    required: false,
    description:
      'Explicit staff replacements by saved booking item. Omitted items retain their staff.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ArrayUnique((item: BookingItemStaffAssignmentDto) => item?.bookingItemId)
  @ValidateNested({ each: true })
  @Type(() => BookingItemStaffAssignmentDto)
  staffAssignments?: BookingItemStaffAssignmentDto[];

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Custom time flag for manual bookings. Omit to preserve the current value. Does not change the booking channel or status.',
  })
  @IsOptional()
  @IsBoolean()
  isCustomTime?: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    type: String,
    example: '2026-09-20T10:00:00',
    required: false,
  })
  @IsOptional()
  @IsLocalDateTime()
  startAt?: string;

  @ApiProperty({
    type: String,
    example: '2026-09-20T10:30:00',
    required: false,
    description:
      'Local datetime in location timezone. When present, updates the booking as a manual interval without requiring an available slot.',
  })
  @IsOptional()
  @IsLocalDateTime()
  endAt?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Link an existing brand client. The booking takes the client name, phone and email from the profile; firstName, lastName, phone and email in the request are ignored. Also syncs the client of the booking active order. Cannot be combined with anonymous or linkClientByPhone (400 BOOKING_CLIENT_CONFLICT). Unknown or foreign client: 404 BOOKING_CLIENT_NOT_FOUND.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true: unlink the client (clientId = null) like an anonymous manual booking. The contact snapshot takes firstName, lastName, phone and email from the request; omitted ones are cleared. Also syncs the client of the booking active order. false or omitted: no effect. Cannot be combined with clientId or linkClientByPhone (400 BOOKING_CLIENT_CONFLICT).',
  })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true: find the brand client by phone or create one from firstName, lastName, phone and email (as a manual booking without clientId does) and link it, also replacing a linked client. firstName and phone are required (400). The booking takes the contact snapshot from the found profile; an existing profile is not changed. Also syncs the client of the booking active order. Cannot be combined with clientId or anonymous (400 BOOKING_CLIENT_CONFLICT). Without clientId, anonymous or linkClientByPhone the contact fields only edit the snapshot of this booking and the linked client stays.',
  })
  @IsOptional()
  @IsBoolean()
  linkClientByPhone?: boolean;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({ type: String, maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ type: String, maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({
    type: () => UpdateBookingItemPriceDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ArrayUnique((item: UpdateBookingItemPriceDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => UpdateBookingItemPriceDto)
  items?: UpdateBookingItemPriceDto[];

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({
    type: String,
    maxLength: 2000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
