import { Module } from '@nestjs/common';
import { BrandModule } from '../brand.module.js';
import { BrandController } from '../controllers/brand.controller.js';
import { BrandOnboardingModule } from '../onboarding/brand-onboarding.module.js';

@Module({
  imports: [BrandModule, BrandOnboardingModule],
  controllers: [BrandController],
})
export class BrandApiModule {}
