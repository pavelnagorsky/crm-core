import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { ClientsExportService } from './export/services/clients-export.service.js';
import { ClientsController } from './controllers/clients.controller.js';
import { ClientImportFileInterceptor } from './import/interceptors/client-import-file.interceptor.js';
import { ClientsImportService } from './import/services/clients-import.service.js';
import { ClientsSheetService } from './import/services/clients-sheet.service.js';
import { ClientsService } from './services/clients.service.js';

@Module({
  imports: [I18nModule],
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
