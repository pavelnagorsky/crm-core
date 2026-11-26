import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { BookingRepricingMode } from '../enums/booking-repricing-mode.enum.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { UpdateBookingItemPriceDto } from './update-booking-item-price.dto.js';
import { PromoCodeField } from '../decorators/promo-code-field.decorator.js';
import { MANUAL_TRAFFIC_SOURCES } from '../../../shared/traffic/constants/manual-traffic-sources.constants.js';
import { TRAFFIC_DETAIL_MAX_LENGTH } from '../../../shared/traffic/constants/traffic-limits.constants.js';
import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { BookingItemStaffAssignmentDto } from './booking-item-staff-assignment.dto.js';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';

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

  /**
   * A changed code re-prices every item at its staff and time; null removes the code.
   * Missing: unchanged.
   */
  @PromoCodeField()
  promoCode?: string | null;

  @ApiProperty({
    enum: BookingRepricingMode,
    enumName: 'BookingRepricingMode',
    required: false,
    default: BookingRepricingMode.KEEP,
    description:
      'KEEP: prices stay (items whose discount is picked again and a changed promoCode still re-price). RECALCULATE: every item gets fresh price layers at its final staff and time, as at creation: custom prices and the picked discounts stay (a picked promotion that no longer applies gives the best one), the promo code stays if it applies, else it is removed. Allowed without a move. 400 BOOKING_REPRICE_COMPLETED for a COMPLETED, CANCELLED or NO_SHOW booking (docs/pricing-stage5-api.md).',
  })
  @IsOptional()
  @IsEnum(BookingRepricingMode)
  pricing?: BookingRepricingMode;

  @ApiPrice({
    required: false,
    description:
      'Required with pricing RECALCULATE, ignored otherwise: the services total the administrator saw (serviceTotal of POST pricing with bookingId). A different recalculated total (sum of customPrice ?? chargedPrice) is 409 PRICE_CHANGED { expectedTotal, total, items, promoCode }.',
  })
  @ValidateIf(
    (dto: UpdateBookingDto) => dto.pricing === BookingRepricingMode.RECALCULATE,
  )
  @CanonicalAmount()
  @Matches(regularExpressions.moneyAmount, {
    message:
      'expectedTotal must be a non-negative amount with at most 2 decimal places',
  })
  expectedTotal?: string;

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

  @ApiProperty({
    enum: TrafficSource,
    enumName: 'TrafficSource',
    required: false,
    nullable: true,
    description:
      'Manual bookings only (else 400 BOOKING_TRAFFIC_SOURCE_READ_ONLY). Omit to keep, null to clear. Any source except DIRECT. A changed source without trafficSourceDetail clears the detail. When this is the client first booking, the client acquisition source follows.',
  })
  @IsOptional()
  @IsIn(MANUAL_TRAFFIC_SOURCES)
  trafficSource?: TrafficSource | null;

  @ApiProperty({
    type: String,
    maxLength: TRAFFIC_DETAIL_MAX_LENGTH,
    required: false,
    nullable: true,
    description:
      'Manual bookings only (else 400 BOOKING_TRAFFIC_SOURCE_READ_ONLY). Omit to keep, null to clear. Needs a source (400 TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(TRAFFIC_DETAIL_MAX_LENGTH)
  trafficSourceDetail?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description:
      'Draft PRODUCT lines of the visit order to confirm after the edit, in the same transaction. Needs order:write. Errors as in PUT bookings/:id/payment.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  confirmProductItemIds?: string[];

  @IsOptionalPrice(
    'Required with a non-empty confirmProductItemIds (400 VALIDATION_ERROR): Σ lineTotal of those lines the administrator saw. They are priced again with fresh data at confirmation; a different total is 409 PRICE_CHANGED { expectedTotal, total, products, promoCode }. Checked after expectedTotal of the services.',
  )
  expectedProductTotal?: string | null;

  @ApiProperty({
    type: () => PaymentInputDto,
    required: false,
    description:
      'Payment of the visit, applied after the edit (and confirmed products) in the same transaction, by the rules of PUT bookings/:id/payment: a started PENDING or CONFIRMED visit is completed; replacing an active payment needs order:write.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInputDto)
  payment?: PaymentInputDto;
}
