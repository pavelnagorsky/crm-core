import { Module } from '@nestjs/common';
import { PaymentsAggregatesService } from './services/payments-aggregates.service.js';

@Module({
  providers: [PaymentsAggregatesService],
  exports: [PaymentsAggregatesService],
})
export class PaymentsAggregatesModule {}
