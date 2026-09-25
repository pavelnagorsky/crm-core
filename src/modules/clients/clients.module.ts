import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { ClientsSheetService } from './clients-import/clients-sheet.service.js';
import { ClientsImportService } from './clients-import/clients-import.service.js';
import { ClientImportFileInterceptor } from './clients-import/client-import-file.interceptor.js';
import { ClientsController } from './clients.controller.js';
import { BusinessModule } from '../business/business.module.js';

@Module({
  imports: [BusinessModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientsSheetService, ClientsImportService, ClientImportFileInterceptor],
  exports: [ClientsService],
})
export class ClientsModule {}
