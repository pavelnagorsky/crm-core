import { Logger, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StateBackend } from '../../enums/state-backend.enum.js';
import { MetricsModule } from '../../metrics/metrics.module.js';
import { RedisModule } from '../../redis/redis.module.js';

/**
 * Compiles `module` the way AppModule does (global config, Redis connection and metrics) with the given state backend.
 * No Redis url is configured and the metrics server is off, so nothing connects: only the adapter choice is under test.
 */
export async function compileWithStateBackend(
  module: Type,
  backend: StateBackend,
): Promise<TestingModule> {
  // RedisService warns once that REDIS_URL is missing.
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const app = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true,
        load: [
          () => ({
            state: { backend },
            metrics: { host: '127.0.0.1', port: 0 },
          }),
        ],
      }),
      MetricsModule,
      RedisModule,
      module,
    ],
  }).compile();
  await app.init();
  return app;
}
