import { SkipThrottle } from '@nestjs/throttler';
import { ThrottlerName } from '../enums/throttler-name.enum.js';

/** Disables every throttler (health checks, trusted internal callers). */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  SkipThrottle(
    Object.fromEntries(
      Object.values(ThrottlerName).map((name) => [name, true]),
    ),
  );
