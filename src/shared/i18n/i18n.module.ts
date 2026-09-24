import { Module } from '@nestjs/common';
import { LocaleService } from './locale.service.js';

@Module({
  providers: [LocaleService],
  exports: [LocaleService],
})
export class I18nModule {}
