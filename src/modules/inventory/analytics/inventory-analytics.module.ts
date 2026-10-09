import { Module } from '@nestjs/common';
import { InventoryAnalyticsController } from './inventory-analytics.controller.js';
import { InventoryAnalyticsService } from './inventory-analytics.service.js';

@Module({
  controllers: [InventoryAnalyticsController],
  providers: [InventoryAnalyticsService],
})
export class InventoryAnalyticsModule {}
