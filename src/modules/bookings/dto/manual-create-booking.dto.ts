import { CreateBookingDto } from './create-booking.dto.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { SETTABLE_BOOKING_STATUSES } from '../constants/settable-booking-statuses.js';
import type { SettableBookingStatus } from '../constants/settable-booking-statuses.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { ManualBookingItemDto } from './manual-booking-item.dto.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { ManualBookingProductDto } from './manual-booking-product.dto.js';

export class ManualCreateBookingDto extends CreateBookingDto {
  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Create the booking without linking or creating a client profile. Manual endpoint only.',
  })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiProperty({
    type: String,
    maxLength: 100,
    required: false,
    description:
      'Required unless anonymous is true or clientId is set; ignored with clientId',
  })
  declare firstName: string;

  @ApiProperty({
    type: String,
    example: '+375292332000',
    required: false,
    description:
      'E.164 after normalization. Required unless anonymous is true or clientId is set; ignored with clientId',
  })
  declare phone: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description:
      'Existing brand client to book. The booking takes the client name, phone and email from the profile; firstName, lastName and phone in the request are then optional and ignored. An email in the request is saved to a profile that has none. Cannot be combined with anonymous. Unknown or foreign client: 404 BOOKING_CLIENT_NOT_FOUND.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({
    enum: SETTABLE_BOOKING_STATUSES,
    required: false,
    description:
      'Initial status. Omitted: CONFIRMED, or with isCustomTime COMPLETED once the visit has ended. Takes precedence over isCustomTime. COMPLETED and NO_SHOW require a visit that has already started (400 BOOKING_STATUS_BEFORE_START); COMPLETED also requires order:write (403 BOOKING_COMPLETED_CREATE_FORBIDDEN). COMPLETED and NO_SHOW never email the client.',
  })
  @IsOptional()
  @IsEnum(SETTABLE_BOOKING_STATUSES)
  status?: SettableBookingStatus;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Create a manual booking with custom time. Skips the working-hours, block and overlapping-booking checks (the staff member must still perform the service), confirms an ongoing visit and completes an elapsed visit automatically.',
  })
  @IsOptional()
  @IsBoolean()
  isCustomTime?: boolean;

  @ApiProperty({
    type: () => ManualBookingItemDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingItemDto)
  items?: ManualBookingItemDto[];

  @ApiProperty({ enum: BookingExecutionMode, required: false })
  @IsOptional()
  @IsEnum(BookingExecutionMode)
  executionMode?: BookingExecutionMode;

  @ApiProperty({
    type: String,
    maxLength: 2000,
    required: false,
    nullable: true,
    description:
      'Internal staff note saved atomically with the manual booking.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;

  @ApiProperty({
    type: () => ManualBookingProductDto,
    isArray: true,
    required: false,
    description:
      'Draft product sale lines to attach to the booking order atomically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingProductDto)
  products?: ManualBookingProductDto[];

  @ApiProperty({
    type: String,
    example: '2026-09-20T10:30:00',
    required: false,
    description:
      'Local datetime in location timezone. Used only when isCustomTime is true to override actual end time.',
  })
  @IsOptional()
  @IsLocalDateTime()
  endAt?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Email the client about this booking: the confirmation now and later reschedules by staff. Defaults to the location notifyClientOnStaffChanges setting. Stored on the booking. Reminders, cancellations and status emails are not affected.',
  })
  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}
