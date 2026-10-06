import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';

@Module({
  imports: [UserModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
