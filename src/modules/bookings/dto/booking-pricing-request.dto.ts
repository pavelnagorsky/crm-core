import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { StaffAssignments } from '../../../shared/scheduling/decorators/staff-assignments.decorator.js';
import { StaffAssignmentDto } from '../../../shared/scheduling/dto/staff-assignment.dto.js';
import { IsLocalDateTime } from '../../../shared/time/decorators/is-local-date-time.validator.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { ManualBookingItemDto } from './manual-booking-item.dto.js';
import { PromoCodeField } from '../decorators/promo-code-field.decorator.js';
import { ManualBookingProductDto } from './manual-booking-product.dto.js';

export class BookingPricingRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    deprecated: true,
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ type: String, format: 'uuid', isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  bundleId?: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description: 'Staff member the services are priced with',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @StaffAssignments()
  staffAssignments?: StaffAssignmentDto[];

  @ApiProperty({
    type: String,
    required: false,
    example: '2026-09-20T17:00:00',
    description:
      'Visit start: local datetime in the location timezone, no offset, like startAt of booking creation. Surcharges apply by it; without it the preview has no surcharges.',
  })
  @IsOptional()
  @IsLocalDateTime()
  startAt?: string;

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

  @ApiProperty({
    type: () => ManualBookingProductDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingProductDto)
  products?: ManualBookingProductDto[];

  @PromoCodeField()
  promoCode?: string;

  @ApiProperty({
    type: String,
    example: '+375292332000',
    required: false,
    description:
      'Phone of the guest, as booking creation takes it: the brand client with it gets the discounts for new clients, birthdays and the personal discount. An unknown phone is a new client.',
  })
  @IsOptionalPhone()
  clientPhone?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description:
      'Cabinet only (a token that may book in the location): the client of the booking dialog.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;
}
