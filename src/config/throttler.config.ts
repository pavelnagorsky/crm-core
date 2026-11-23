import { minutes, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerName } from '../shared/enums/throttler-name.enum.js';

/**
 * The per-IP flood cap across the whole API is in the lb nginx (docker/nginx/lb.conf); the app keeps only
 * the limits nginx cannot express: per endpoint, tightened or relaxed by decorators.
 */
export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: ThrottlerName.SUSTAINED,
      ttl: minutes(1),
      limit: 300,
    },
  ],
};
