import { Module } from '@nestjs/common';
import { LocationModule } from '../../location/location.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { ReviewsModule } from '../reviews.module.js';
import { ReviewImportController } from './controllers/review-import.controller.js';
import { ReviewImportFileInterceptor } from './interceptors/review-import-file.interceptor.js';
import { ReviewImportService } from './services/review-import.service.js';
import { ReviewSheetService } from './services/review-sheet.service.js';

@Module({
  imports: [ReviewsModule, StaffModule, LocationModule],
  controllers: [ReviewImportController],
  providers: [
    ReviewImportService,
    ReviewSheetService,
    ReviewImportFileInterceptor,
  ],
})
export class ReviewImportModule {}
