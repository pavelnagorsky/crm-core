import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { BookingVisitsModule } from '../bookings/visits/booking-visits.module.js';
import { LocationModule } from '../location/location.module.js';
import { PublicReviewsController } from './controllers/public-reviews.controller.js';
import { ReviewsController } from './controllers/reviews.controller.js';
import { ReviewsFacade } from './reviews.facade.js';
import { ReviewAggregatesService } from './services/review-aggregates.service.js';
import { ReviewAuditService } from './services/review-audit.service.js';
import { ReviewImportStoreService } from './services/review-import-store.service.js';
import { ReviewModerationService } from './services/review-moderation.service.js';
import { ReviewsService } from './services/reviews.service.js';

@Module({
  imports: [AppCacheModule, LocationModule, BookingVisitsModule],
  controllers: [PublicReviewsController, ReviewsController],
  providers: [
    ReviewsService,
    ReviewModerationService,
    ReviewAggregatesService,
    ReviewAuditService,
    ReviewImportStoreService,
    ReviewsFacade,
  ],
  exports: [ReviewsFacade],
})
export class ReviewsModule {}
