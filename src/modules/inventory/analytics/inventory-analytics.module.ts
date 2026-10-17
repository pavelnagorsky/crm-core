import { Module } from '@nestjs/common';
import { InventoryAnalyticsController } from './controllers/inventory-analytics.controller.js';
import { InventoryAnalyticsService } from './services/inventory-analytics.service.js';

@Module({
  controllers: [InventoryAnalyticsController],
  providers: [InventoryAnalyticsService],
})
export class InventoryAnalyticsModule {}
