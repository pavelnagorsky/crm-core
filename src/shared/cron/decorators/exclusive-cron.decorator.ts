import { Cron, CronOptions } from '@nestjs/schedule';
import { CronLockService } from '../cron-lock.service.js';

type CronMethod = (...args: any[]) => Promise<unknown>;

/**
 * `@Cron` that runs at most once per minute across processes (see `CronLockService`); a skipped run resolves
 * to `undefined`. Arguments and the result are passed through, so tests may call the method directly.
 */
export function ExclusiveCron(
  cronTime: string,
  options?: CronOptions,
): <T extends CronMethod>(
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>,
) => TypedPropertyDescriptor<T> {
  return (target, propertyKey, descriptor) => {
    const original = descriptor.value!;
    const lockName = `${target.constructor.name}.${String(propertyKey)}`;
    const wrapper = async function (this: unknown, ...args: unknown[]) {
      const lock = CronLockService.registered;
      if (lock && !(await lock.acquire(lockName))) return undefined;
      return original.apply(this, args);
    };
    Object.defineProperty(wrapper, 'name', { value: original.name });
    descriptor.value = wrapper as typeof original;
    // Cron metadata goes on `descriptor.value`, so it is applied to the wrapper, not to the original method.
    Cron(cronTime, options)(target, propertyKey, descriptor);
    return descriptor;
  };
}
