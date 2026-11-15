import { ApiProperty } from '@nestjs/swagger';
import { BillingSettings, SubscriptionPaymentProvider } from '@prisma/client';
import { PaymentProvider } from '../interfaces/payment-provider.interface.js';
import { PaymentProviderDto } from './payment-provider.dto.js';

export class BillingSettingsResponseDto {
  @ApiProperty({ example: 'BY' })
  defaultCountryCode: string;

  @ApiProperty()
  trialDays: number;

  @ApiProperty()
  graceDays: number;

  @ApiProperty({ type: [Number], example: [7, 3, 1] })
  reminderDaysBefore: number[];

  @ApiProperty({
    enum: SubscriptionPaymentProvider,
    enumName: 'SubscriptionPaymentProvider',
  })
  paymentProvider: SubscriptionPaymentProvider;

  @ApiProperty()
  paymentRequestTtlDays: number;

  @ApiProperty()
  pendingRequestGraceDays: number;

  @ApiProperty({ type: String, nullable: true })
  offlinePaymentInstructions: string | null;

  @ApiProperty({ type: String, nullable: true })
  adminNotifyEmail: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Set by the launch script only',
  })
  launchedAt: Date | null;

  @ApiProperty()
  enforcementEnabled: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: () => PaymentProviderDto, isArray: true })
  providers: PaymentProviderDto[];

  static fromEntity(
    settings: BillingSettings,
    providers: PaymentProvider[],
  ): BillingSettingsResponseDto {
    return Object.assign(new BillingSettingsResponseDto(), {
      defaultCountryCode: settings.defaultCountryCode,
      trialDays: settings.trialDays,
      graceDays: settings.graceDays,
      reminderDaysBefore: settings.reminderDaysBefore,
      paymentProvider: settings.paymentProvider,
      paymentRequestTtlDays: settings.paymentRequestTtlDays,
      pendingRequestGraceDays: settings.pendingRequestGraceDays,
      offlinePaymentInstructions: settings.offlinePaymentInstructions,
      adminNotifyEmail: settings.adminNotifyEmail,
      launchedAt: settings.launchedAt,
      enforcementEnabled: settings.enforcementEnabled,
      updatedAt: settings.updatedAt,
      providers: providers.map(PaymentProviderDto.fromEntity),
    });
  }
}
