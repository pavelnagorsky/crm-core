import { ApiProperty } from '@nestjs/swagger';
import { AdminSubscriptionDetails } from '../interfaces/admin-subscription-details.interface.js';
import { AdminSubscriptionEventDto } from './admin-subscription-event.dto.js';
import { AdminSubscriptionItemDto } from './admin-subscription-item.dto.js';
import { AdminSubscriptionPaymentDto } from './admin-subscription-payment.dto.js';

export class AdminSubscriptionDetailsResponseDto extends AdminSubscriptionItemDto {
  @ApiProperty({ example: 'BY' })
  pricingCountry: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  trialUserId: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceExtendedUntil: Date | null;

  @ApiProperty({
    type: () => AdminSubscriptionPaymentDto,
    isArray: true,
    description:
      'Latest payments, newest first; the full list is /admin/billing/payments?brandId=',
  })
  payments: AdminSubscriptionPaymentDto[];

  @ApiProperty({
    type: () => AdminSubscriptionEventDto,
    isArray: true,
    description: 'Latest events, newest first',
  })
  events: AdminSubscriptionEventDto[];

  static fromDetails(
    details: AdminSubscriptionDetails,
  ): AdminSubscriptionDetailsResponseDto {
    return Object.assign(
      AdminSubscriptionItemDto.fill(
        new AdminSubscriptionDetailsResponseDto(),
        details,
      ),
      {
        pricingCountry: details.pricingCountry,
        currency: details.currency,
        trialUserId: details.subscription.trialUserId,
        graceExtendedUntil: details.subscription.graceExtendedUntil,
        payments: details.payments.map((p) =>
          AdminSubscriptionPaymentDto.fromAdmin(p, details.brandName),
        ),
        events: details.events.map(AdminSubscriptionEventDto.fromEntity),
      },
    );
  }
}
