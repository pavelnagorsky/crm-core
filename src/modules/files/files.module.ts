import { Module } from '@nestjs/common';
import { FilesController } from './controllers/files.controller.js';
import { FilesService } from './services/files.service.js';

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
