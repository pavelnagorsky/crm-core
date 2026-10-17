import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ProductsModule } from '../products/products.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { OrdersAggregatesService } from './aggregates/services/orders-aggregates.service.js';
import { OrderPricingCalculator } from './calculators/order-pricing.calculator.js';
import { OrdersController } from './controllers/orders.controller.js';
import { OrdersFacade } from './orders.facade.js';
import { OrderStateRules } from './rules/order-state.rules.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderCreationService } from './services/order-creation.service.js';
import { OrderDraftMutationService } from './services/order-draft-mutation.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderReturnService } from './services/order-return.service.js';

@Module({
  imports: [
    BookingsAggregatesModule,
    LocationModule,
    ProductsModule,
    InventoryModule,
    StaffModule,
    PayrollModule,
    ClientsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersFacade,
    OrderAuditService,
    OrderDraftMutationService,
    OrderCreationService,
    OrderPricingCalculator,
    OrderPersistenceService,
    OrderDraftService,
    OrderBookingSyncService,
    OrderProductTransitionService,
    OrderReturnService,
    OrderStateRules,
    OrdersAggregatesService,
  ],
  exports: [OrdersFacade, OrdersAggregatesService],
})
export class OrdersModule {}
