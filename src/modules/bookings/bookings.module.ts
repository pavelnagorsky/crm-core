import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { BookingsController } from './bookings.controller.js';
import { BusinessModule } from '../business/business.module.js';

@Module({
  imports: [BusinessModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
