import { minutes, Throttle } from '@nestjs/throttler';
import { ThrottlerName } from '../enums/throttler-name.enum.js';

/** Anonymous public endpoints that are cheap but easy to spam. */
export const PublicRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({ [ThrottlerName.SUSTAINED]: { limit: 120, ttl: minutes(1) } });
