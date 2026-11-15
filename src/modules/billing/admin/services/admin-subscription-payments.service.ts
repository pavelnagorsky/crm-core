import { Injectable } from '@nestjs/common';
import { SubscriptionPayment } from '@prisma/client';
import { BrandService } from '../../../brand/services/brand.service.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { AdminSubscriptionPaymentsRequestDto } from '../../dto/admin-subscription-payments-request.dto.js';
import { CancelSubscriptionPaymentDto } from '../../dto/cancel-subscription-payment.dto.js';
import { ConfirmSubscriptionPaymentDto } from '../../dto/confirm-subscription-payment.dto.js';
import { AdminPaymentWithBrand } from '../../interfaces/admin-payment-with-brand.interface.js';
import { AdminPaymentsPage } from '../../interfaces/admin-payments-page.interface.js';
import { PaymentMailService } from '../../mail/services/payment-mail.service.js';
import { PaymentConfirmationService } from '../../payments/services/payment-confirmation.service.js';
import { PaymentRequestService } from '../../payments/services/payment-request.service.js';
import { SubscriptionPaymentService } from '../../payments/services/subscription-payment.service.js';

/** The admin payments queue: search, «Оплачено», cancel (plan section 8.3). */
@Injectable()
export class AdminSubscriptionPaymentsService {
  constructor(
    private readonly payments: SubscriptionPaymentService,
    private readonly confirmation: PaymentConfirmationService,
    private readonly requests: PaymentRequestService,
    private readonly paymentMail: PaymentMailService,
    private readonly brands: BrandService,
  ) {}

  async search(
    dto: AdminSubscriptionPaymentsRequestDto,
  ): Promise<AdminPaymentsPage> {
    const page = await this.payments.searchAdmin(dto);
    const brandNames = await this.brands.findNames(
      page.items.map((p) => p.brandId),
    );
    return { ...page, brandNames };
  }

  /** «Оплачено»: the amount is the request snapshot; another amount is a manual payment. */
  async confirm(
    id: string,
    dto: ConfirmSubscriptionPaymentDto,
    actorId: string,
    now = new Date(),
  ): Promise<AdminPaymentWithBrand> {
    const current = await this.payments.findById(id);
    const { payment, applied } = await this.confirmation.confirm(
      id,
      {
        paidAt: new Date(dto.paidAt),
        method: dto.method,
        amount: current.amount,
        currency: current.currency,
        reference: dto.reference ?? null,
        adminNote: dto.adminNote ?? null,
        actor: BillingActors.admin(actorId),
      },
      now,
    );
    if (applied) await this.paymentMail.received(payment);
    return this.withBrand(payment);
  }

  async cancel(
    id: string,
    dto: CancelSubscriptionPaymentDto,
    actorId: string,
  ): Promise<AdminPaymentWithBrand> {
    const payment = await this.requests.cancel(
      id,
      BillingActors.admin(actorId),
      { adminNote: dto.adminNote ?? null },
    );
    return this.withBrand(payment);
  }

  private async withBrand(
    payment: SubscriptionPayment,
  ): Promise<AdminPaymentWithBrand> {
    return { payment, brandName: await this.brands.findName(payment.brandId) };
  }
}
