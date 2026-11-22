import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/** The Redis connection only. Stores built on it live with their features and are the only users of RedisService. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
