import { CreateBookingDto } from './create-booking.dto.js';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsBoolean,
  IsArray,
  IsEnum,
  IsIn,
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
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { ManualBookingProductDto } from './manual-booking-product.dto.js';
import { MANUAL_TRAFFIC_SOURCES } from '../../../shared/traffic/constants/manual-traffic-sources.constants.js';
import { TRAFFIC_DETAIL_MAX_LENGTH } from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';

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
      'Initial status. Omitted: CONFIRMED, or with isCustomTime COMPLETED once the visit has ended. Takes precedence over isCustomTime. COMPLETED and NO_SHOW require a visit that has already started (400 BOOKING_STATUS_BEFORE_START) and never email the client. COMPLETED needs no extra permission, as on a status change, and syncs order and payroll like a completion.',
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

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    required: false,
    description:
      'Where the client came from, picked by staff. Any source except DIRECT (400). Omitted: not specified. Also becomes the client acquisition source when this is the client first booking.',
  })
  @IsOptional()
  @IsIn(MANUAL_TRAFFIC_SOURCES)
  trafficSource?: TrafficSource;

  @ApiProperty({
    type: String,
    maxLength: TRAFFIC_DETAIL_MAX_LENGTH,
    required: false,
    description:
      'Source detail ("Уточнение"), only with trafficSource (400 TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRAFFIC_DETAIL_MAX_LENGTH)
  trafficSourceDetail?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Confirm (sell) all products in the same transaction, so a payment covers them. Needs order:write. Not allowed for NO_SHOW (409 BOOKING_PAYMENT_NOT_ALLOWED).',
  })
  @IsOptional()
  @IsBoolean()
  confirmProducts?: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description:
      'Per item in the services order: the staff member the booking dialog showed (items[].staffId of POST pricing). Used only for items without a chosen staff member: the member is taken first when still free. When the rule gives another staff member, nothing is created: 409 PRICE_CHANGED if the total differs from expectedTotal, else 409 BOOKING_STAFF_CHANGED with the same payload { expectedTotal, total, items, promoCode }.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  preferredStaffIds?: string[];

  @IsOptionalPrice(
    'The services total the administrator saw (serviceTotal of POST pricing for the same request). The services are priced again with fresh data and the assigned staff; a different total (sum of customPrice ?? chargedPrice) is 409 PRICE_CHANGED { expectedTotal, total, items, promoCode } and nothing is created. Omitted: not checked.',
  )
  expectedTotal?: string | null;

  @IsOptionalPrice(
    'Required with confirmProducts and products (400 VALIDATION_ERROR): productTotal of POST pricing the administrator saw. The products are priced again with fresh data at confirmation; a different total is 409 PRICE_CHANGED { expectedTotal, total, products, promoCode } and nothing is created.',
  )
  expectedProductTotal?: string | null;

  @ApiProperty({
    type: () => PaymentInputDto,
    required: false,
    description:
      'Payment of the visit, recorded after the booking (and confirmed products) in the same transaction. A started visit with status PENDING or CONFIRMED (explicit or default) is created COMPLETED. Nothing due (for example NO_SHOW): 409 PAYMENT_NOTHING_DUE. A key that was used before: 409 PAYMENT_IDEMPOTENCY_CONFLICT, nothing is created. Other payment errors as in PUT bookings/:id/payment.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInputDto)
  payment?: PaymentInputDto;

  /** Staff may skip the client (anonymous) or pick a stored one (clientId). */
  static override requiresClientContacts(dto: ManualCreateBookingDto): boolean {
    return dto.anonymous !== true && !dto.clientId;
  }
}
