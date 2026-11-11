import { Module } from '@nestjs/common';
import { I18nModule } from '../../../shared/i18n/i18n.module.js';
import { LocationModule } from '../../location/location.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { ReviewsModule } from '../reviews.module.js';
import { ReviewImportController } from './controllers/review-import.controller.js';
import { ReviewImportFileInterceptor } from './interceptors/review-import-file.interceptor.js';
import { ReviewImportTemplateService } from './services/review-import-template.service.js';
import { ReviewImportService } from './services/review-import.service.js';
import { ReviewSheetService } from './services/review-sheet.service.js';

@Module({
  imports: [ReviewsModule, StaffModule, LocationModule, I18nModule],
  controllers: [ReviewImportController],
  providers: [
    ReviewImportService,
    ReviewSheetService,
    ReviewImportTemplateService,
    ReviewImportFileInterceptor,
  ],
})
export class ReviewImportModule {}
