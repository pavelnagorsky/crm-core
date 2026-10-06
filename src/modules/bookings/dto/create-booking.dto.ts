import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../../shared/constants/multi-service.constants.js';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { IsLocalDateTime } from '../../time/decorators/is-local-date-time.validator.js';
import { AtMostOneBookingChannelConstraint } from '../decorators/at-most-one-booking-channel.constraint.js';

export class CreateBookingDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Published booking page that produced this booking',
  })
  @Validate(AtMostOneBookingChannelConstraint)
  @IsOptional()
  @IsUUID()
  bookingPageId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Published booking widget that produced this booking',
  })
  @IsOptional()
  @IsUUID()
  bookingWidgetId?: string;

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
  bundleId?: string;

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
    description: 'Local datetime in business timezone, no offset',
  })
  @IsLocalDateTime()
  startAt: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    type: String,
    maxLength: 100,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @IsPhone()
  phone: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

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
}
