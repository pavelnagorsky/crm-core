import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { BookingVisitsModule } from '../bookings/visits/booking-visits.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { PaymentsAggregatesModule } from '../payments/aggregates/payments-aggregates.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ProductsModule } from '../products/products.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { OrdersAggregatesService } from './aggregates/services/orders-aggregates.service.js';
import { OrderPricingCalculator } from './calculators/order-pricing.calculator.js';
import { OrdersController } from './controllers/orders.controller.js';
import { OrderPaymentsFacade } from './order-payments.facade.js';
import { OrdersFacade } from './orders.facade.js';
import { OrderStateRules } from './rules/order-state.rules.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderCreationService } from './services/order-creation.service.js';
import { OrderDraftMutationService } from './services/order-draft-mutation.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderLockService } from './services/order-lock.service.js';
import { OrderPaymentCorrectionService } from './services/order-payment-correction.service.js';
import { OrderPaymentTrackingService } from './services/order-payment-tracking.service.js';
import { OrderPaymentService } from './services/order-payment.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderProductPricingService } from './services/order-product-pricing.service.js';
import { OrderPriceAnalyticsService } from './services/order-price-analytics.service.js';
import { OrderPricingPreviewService } from './services/order-pricing-preview.service.js';
import { OrderReturnService } from './services/order-return.service.js';

@Module({
  imports: [
    BookingsAggregatesModule,
    BookingVisitsModule,
    LocationModule,
    ProductsModule,
    InventoryModule,
    StaffModule,
    PayrollModule,
    ClientsModule,
    PaymentsModule,
    PaymentsAggregatesModule,
    PricingModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersFacade,
    OrderPaymentsFacade,
    OrderLockService,
    OrderAuditService,
    OrderDraftMutationService,
    OrderCreationService,
    OrderPricingCalculator,
    OrderProductPricingService,
    OrderPricingPreviewService,
    OrderPriceAnalyticsService,
    OrderPersistenceService,
    OrderDraftService,
    OrderBookingSyncService,
    OrderProductTransitionService,
    OrderReturnService,
    OrderPaymentService,
    OrderPaymentCorrectionService,
    OrderPaymentTrackingService,
    OrderStateRules,
    OrdersAggregatesService,
  ],
  exports: [OrdersFacade, OrderPaymentsFacade, OrdersAggregatesService],
})
export class OrdersModule {}
