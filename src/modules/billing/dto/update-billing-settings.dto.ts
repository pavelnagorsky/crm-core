import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPaymentProvider } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class UpdateBillingSettingsDto {
  @ApiProperty({
    example: 'BY',
    description: 'Prices of this country apply to countries without their own',
  })
  @TrimString()
  @Matches(regularExpressions.countryCode)
  defaultCountryCode: string;

  @ApiProperty({ minimum: 1, maximum: 365, example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays: number;

  @ApiProperty({ minimum: 0, maximum: 30, example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  graceDays: number;

  @ApiProperty({
    type: [Number],
    example: [7, 3, 1],
    description: 'Days before access ends when reminders go out',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  reminderDaysBefore: number[];

  @ApiProperty({
    enum: SubscriptionPaymentProvider,
    enumName: 'SubscriptionPaymentProvider',
    description: 'Provider of owner requests; must be owner-initiated',
  })
  @IsEnum(SubscriptionPaymentProvider)
  paymentProvider: SubscriptionPaymentProvider;

  @ApiProperty({ minimum: 1, maximum: 90, example: 14 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  paymentRequestTtlDays: number;

  @ApiProperty({
    minimum: 0,
    maximum: 30,
    example: 3,
    description: 'Extra grace days an open request grants once per cycle',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  pendingRequestGraceDays: number;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 5000,
    description: 'Text the owner sees after an offline request',
  })
  @TrimString()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  offlinePaymentInstructions: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 254,
    description: 'Where new requests are announced',
  })
  @TrimString()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  @MaxLength(254)
  adminNotifyEmail: string | null;

  @ApiProperty({
    description: 'Turns on limits and the block after grace days',
  })
  @IsBoolean()
  enforcementEnabled: boolean;
}
