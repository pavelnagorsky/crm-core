import { Module } from '@nestjs/common';
import { SuppliersController } from './controllers/suppliers.controller.js';
import { SuppliersService } from './services/suppliers.service.js';

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
