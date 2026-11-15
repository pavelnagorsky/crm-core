import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPaymentProvider } from '@prisma/client';
import { PaymentProvider } from '../interfaces/payment-provider.interface.js';

export class PaymentProviderDto {
  @ApiProperty({
    enum: SubscriptionPaymentProvider,
    enumName: 'SubscriptionPaymentProvider',
  })
  code: SubscriptionPaymentProvider;

  @ApiProperty({
    description: 'Can be chosen as paymentProvider in the settings',
  })
  ownerInitiated: boolean;

  @ApiProperty({ description: 'An admin confirms the payment manually' })
  adminConfirmable: boolean;

  @ApiProperty()
  webhooks: boolean;

  @ApiProperty()
  statusPolling: boolean;

  @ApiProperty()
  recurring: boolean;

  static fromEntity(provider: PaymentProvider): PaymentProviderDto {
    return Object.assign(new PaymentProviderDto(), {
      code: provider.code,
      ...provider.capabilities,
    });
  }
}
