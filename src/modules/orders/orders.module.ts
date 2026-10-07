import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ProductsModule } from '../products/products.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { OrderComputeService } from './order-compute.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    LocationModule,
    ProductsModule,
    InventoryModule,
    StaffModule,
    PayrollModule,
    BookingsModule,
    ClientsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderComputeService],
})
export class OrdersModule {}
