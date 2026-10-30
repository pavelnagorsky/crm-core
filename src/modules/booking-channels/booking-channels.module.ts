import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { FilesModule } from '../files/files.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { BookingPagesController } from './controllers/booking-pages.controller.js';
import { BookingPalettesController } from './controllers/booking-palettes.controller.js';
import { BookingWidgetsController } from './controllers/booking-widgets.controller.js';
import { PublicBookingChannelEventsController } from './controllers/public-booking-channel-events.controller.js';
import { PublicBookingChannelsController } from './controllers/public-booking-channels.controller.js';
import { PublicBookingCreateController } from './controllers/public-booking-create.controller.js';
import { BookingChannelEventsRateGuard } from './guards/booking-channel-events-rate.guard.js';
import { BookingChannelAttributionService } from './services/booking-channel-attribution.service.js';
import { BookingChannelPublishService } from './services/booking-channel-publish.service.js';
import { BookingChannelStatsService } from './services/booking-channel-stats.service.js';
import { BookingPagesService } from './services/booking-pages.service.js';
import { BookingWidgetsService } from './services/booking-widgets.service.js';

@Module({
  imports: [
    LocationModule,
    ServiceCatalogModule,
    FilesModule,
    BookingsModule,
    BookingsAggregatesModule,
  ],
  controllers: [
    PublicBookingChannelEventsController,
    BookingPalettesController,
    BookingPagesController,
    BookingWidgetsController,
    PublicBookingChannelsController,
    PublicBookingCreateController,
  ],
  providers: [
    BookingChannelStatsService,
    BookingChannelEventsRateGuard,
    BookingPagesService,
    BookingWidgetsService,
    BookingChannelPublishService,
    BookingChannelAttributionService,
  ],
})
export class BookingChannelsModule {}
