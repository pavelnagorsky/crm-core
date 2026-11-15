import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPayment } from '@prisma/client';
import { IFrontendConfig } from '../../../../config/interfaces/frontend-config.interface.js';
import { PaymentReference } from '../../compute/payment-reference.js';

/** Frontend links of billing pages, for emails and provider return URLs. */
@Injectable()
export class BillingLinkService {
  private readonly domain: string;

  constructor(config: ConfigService) {
    this.domain = config.get<IFrontendConfig>('frontend')!.domain;
  }

  billing(brandId: string): string {
    return new URL(`/app/brands/${brandId}/billing`, this.domain).toString();
  }

  adminPayment(payment: Pick<SubscriptionPayment, 'number'>): string {
    const url = new URL('/admin/billing/payments', this.domain);
    url.searchParams.set('search', PaymentReference.format(payment.number));
    return url.toString();
  }
}
