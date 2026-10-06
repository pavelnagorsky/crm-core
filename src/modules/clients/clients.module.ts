import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { ClientsSheetService } from './clients-import/clients-sheet.service.js';
import { ClientsImportService } from './clients-import/clients-import.service.js';
import { ClientImportFileInterceptor } from './clients-import/client-import-file.interceptor.js';
import { ClientsExportService } from './clients-export/clients-export.service.js';
import { ClientsController } from './clients.controller.js';
import { BusinessModule } from '../business/business.module.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';

@Module({
  imports: [BusinessModule, I18nModule],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    ClientsSheetService,
    ClientsImportService,
    ClientImportFileInterceptor,
    ClientsExportService,
  ],
  exports: [ClientsService],
})
export class ClientsModule {}
