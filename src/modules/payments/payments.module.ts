import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { PaymentsFacade } from './payments.facade.js';
import { PaymentLedgerService } from './services/payment-ledger.service.js';
import { PaymentReadService } from './services/payment-read.service.js';

/** Owns PaymentOperation and Payment. No controllers: Orders and Bookings expose the API. */
@Module({
  imports: [LocationModule],
  providers: [PaymentsFacade, PaymentLedgerService, PaymentReadService],
  exports: [PaymentsFacade],
})
export class PaymentsModule {}
