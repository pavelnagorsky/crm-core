import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ProductsModule } from '../products/products.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { OrdersAggregatesService } from './analytics/orders-aggregates.service.js';
import { OrderAuditService } from './services/order-audit.service.js';
import { OrderBookingSyncService } from './services/order-booking-sync.service.js';
import { OrderComputeService } from './services/order-compute.service.js';
import { OrderDraftService } from './services/order-draft.service.js';
import { OrderPersistenceService } from './services/order-persistence.service.js';
import { OrderProductTransitionService } from './services/order-product-transition.service.js';
import { OrderStateAssertionService } from './services/order-state-assertion.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

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
    OrdersService,
    OrderAuditService,
    OrderComputeService,
    OrderPersistenceService,
    OrderDraftService,
    OrderBookingSyncService,
    OrderProductTransitionService,
    OrderStateAssertionService,
    OrdersAggregatesService,
  ],
  exports: [OrdersService, OrderComputeService, OrdersAggregatesService],
})
export class OrdersModule {}
