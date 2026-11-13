import { Module } from '@nestjs/common';
import { FilesController } from './controllers/files.controller.js';
import { PrivateFilesController } from './controllers/private-files.controller.js';
import { FileStorageService } from './services/file-storage.service.js';
import { FilesService } from './services/files.service.js';
import { PrivateFileCleanupService } from './services/private-file-cleanup.service.js';
import { PrivateFilesService } from './services/private-files.service.js';

@Module({
  controllers: [FilesController, PrivateFilesController],
  providers: [
    FileStorageService,
    FilesService,
    PrivateFilesService,
    PrivateFileCleanupService,
  ],
  exports: [FilesService, PrivateFilesService],
})
export class FilesModule {}
