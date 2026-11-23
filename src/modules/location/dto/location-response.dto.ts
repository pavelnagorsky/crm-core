import { ApiProperty } from '@nestjs/swagger';
import {
  AnyStaffRule,
  BookingVisibility,
  BusinessType,
  Location,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentTrackingMode } from '../enums/payment-tracking-mode.enum.js';

export class LocationResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String })
  countryCode: string;

  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ type: String })
  timezone: string;

  @ApiProperty({ enum: BusinessType, nullable: true })
  businessType: BusinessType | null;

  @ApiProperty({ type: String, nullable: true })
  city: string | null;

  @ApiProperty({ type: String, nullable: true })
  addressLine: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  instagram: string | null;

  @ApiProperty({ type: String, nullable: true })
  telegram: string | null;

  @ApiProperty({ type: String, nullable: true })
  whatsapp: string | null;

  @ApiProperty({ type: String, nullable: true })
  website: string | null;

  @ApiProperty({ type: String, nullable: true })
  mapWidgetUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  googleReviewUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  yandexReviewUrl: string | null;

  @ApiProperty({ type: Boolean })
  reviewsEnabled: boolean;

  @ApiProperty({ type: Number })
  advanceBookingWindowDays: number;

  @ApiProperty({ type: Number })
  slotIntervalMinutes: number;

  @ApiProperty({ type: Number })
  minimumBookingNoticeMinutes: number;

  @ApiProperty({ enum: BookingVisibility })
  bookingVisibility: BookingVisibility;

  @ApiProperty({ type: Boolean })
  isBookingConfirmationRequired: boolean;

  @ApiProperty({ type: Boolean })
  notifyClientOnStaffChanges: boolean;

  @ApiProperty({ type: Boolean })
  anyStaffEnabled: boolean;

  @ApiProperty({ enum: AnyStaffRule, enumName: 'AnyStaffRule' })
  anyStaffRule: AnyStaffRule;

  @ApiPrice({
    description:
      'Step a surcharged price rounds to: 0.01, 0.10, 0.50, 1.00, 5.00 or 10.00. 0.01 means no rounding.',
  })
  priceRoundingStep: string;

  @ApiProperty({
    enum: PaymentTrackingMode,
    enumName: 'PaymentTrackingMode',
    description:
      'MANUAL: payments are marked by hand. DISABLED: payments are not tracked.',
  })
  paymentTrackingMode: PaymentTrackingMode;

  @ApiProperty({
    type: Date,
    description:
      'Visits (by start) and sales (by date) from this moment are tracked. Not used while DISABLED.',
  })
  paymentTrackingSince: Date;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  static fromEntity(location: Location): LocationResponseDto {
    const dto = new LocationResponseDto();
    dto.id = location.id;
    dto.brandId = location.brandId;
    dto.name = location.name;
    dto.countryCode = location.countryCode;
    dto.currency = location.currency;
    dto.timezone = location.timezone;
    dto.businessType = location.businessType;
    dto.city = location.city;
    dto.addressLine = location.addressLine;
    dto.phone = location.phone;
    dto.instagram = location.instagram;
    dto.telegram = location.telegram;
    dto.whatsapp = location.whatsapp;
    dto.website = location.website;
    dto.mapWidgetUrl = location.mapWidgetUrl;
    dto.googleReviewUrl = location.googleReviewUrl;
    dto.yandexReviewUrl = location.yandexReviewUrl;
    dto.reviewsEnabled = location.reviewsEnabled;
    dto.advanceBookingWindowDays = location.advanceBookingWindowDays;
    dto.slotIntervalMinutes = location.slotIntervalMinutes;
    dto.minimumBookingNoticeMinutes = location.minimumBookingNoticeMinutes;
    dto.bookingVisibility = location.bookingVisibility;
    dto.isBookingConfirmationRequired = location.isBookingConfirmationRequired;
    dto.notifyClientOnStaffChanges = location.notifyClientOnStaffChanges;
    dto.anyStaffEnabled = location.anyStaffEnabled;
    dto.anyStaffRule = location.anyStaffRule;
    dto.priceRoundingStep = MoneyUtils.format(location.priceRoundingStep);
    dto.paymentTrackingMode = location.paymentTrackingMode;
    dto.paymentTrackingSince = location.paymentTrackingSince;
    dto.createdAt = location.createdAt;
    dto.updatedAt = location.updatedAt;
    return dto;
  }
}
