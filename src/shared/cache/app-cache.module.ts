import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { AppCacheService } from './app-cache.service.js';

@Module({
  imports: [ConfigModule, CacheModule.register()],
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class AppCacheModule {}
