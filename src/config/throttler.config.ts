import { ExecutionContext } from '@nestjs/common';
import { minutes, seconds, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerName } from '../shared/enums/throttler-name.enum.js';

const ipWideKey = (
  _context: ExecutionContext,
  tracker: string,
  name: string,
): string => `${name}-${tracker}`;

export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: ThrottlerName.BURST,
      ttl: seconds(1),
      limit: 50,
      blockDuration: seconds(10),
      generateKey: ipWideKey,
    },
    {
      name: ThrottlerName.SUSTAINED,
      ttl: minutes(1),
      limit: 300,
    },
  ],
};
