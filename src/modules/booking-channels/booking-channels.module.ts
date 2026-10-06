import { forwardRef, Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { ServicesModule } from '../services/services.module.js';
import { FilesModule } from '../files/files.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { BookingPagesController } from './booking-pages.controller.js';
import { BookingWidgetsController } from './booking-widgets.controller.js';
import { PublicBookingChannelsController } from './public-booking-channels.controller.js';
import { BookingPagesService } from './booking-pages.service.js';
import { BookingWidgetsService } from './booking-widgets.service.js';
import { BookingChannelPublishService } from './booking-channel-publish.service.js';
import { BookingChannelAttributionService } from './booking-channel-attribution.service.js';

@Module({
  imports: [
    BusinessModule,
    ServicesModule,
    FilesModule,
    // Public channel responses inline booking setup, and public booking creation
    // checks that the attributed page or widget belongs to the business.
    forwardRef(() => BookingsModule),
  ],
  controllers: [
    BookingPagesController,
    BookingWidgetsController,
    PublicBookingChannelsController,
  ],
  providers: [
    BookingPagesService,
    BookingWidgetsService,
    BookingChannelPublishService,
    BookingChannelAttributionService,
  ],
  exports: [BookingChannelAttributionService],
})
export class BookingChannelsModule {}
