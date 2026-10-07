import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
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
import { PublicBookingCreateController } from './public-booking-create.controller.js';

@Module({
  imports: [LocationModule, ServicesModule, FilesModule, BookingsModule],
  controllers: [
    BookingPagesController,
    BookingWidgetsController,
    PublicBookingChannelsController,
    PublicBookingCreateController,
  ],
  providers: [
    BookingPagesService,
    BookingWidgetsService,
    BookingChannelPublishService,
    BookingChannelAttributionService,
  ],
})
export class BookingChannelsModule {}
