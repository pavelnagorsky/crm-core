import { minutes, Throttle } from '@nestjs/throttler';
import { ThrottlerName } from '../enums/throttler-name.enum.js';

/** Brute-force sensitive routes: login, password reset, invitation tokens, public forms. */
export const StrictRateLimit = (): MethodDecorator & ClassDecorator =>
  Throttle({ [ThrottlerName.SUSTAINED]: { limit: 10, ttl: minutes(1) } });
