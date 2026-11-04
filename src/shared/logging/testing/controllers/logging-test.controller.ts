import { Controller, Get, Logger, UnauthorizedException } from '@nestjs/common';
import { setImmediate } from 'node:timers/promises';

@Controller('logging-test')
export class LoggingTestController {
  private readonly logger = new Logger(LoggingTestController.name);

  @Get('ok')
  async ok() {
    await setImmediate();
    this.logger.log('operation completed');
    return { ok: true };
  }

  @Get('rejected')
  rejected(): never {
    this.logger.warn(
      'oauth failed: provider=yandex reason=EMAIL_MISSING_OR_INVALID',
    );
    throw new UnauthorizedException();
  }

  @Get('failed')
  failed(): never {
    throw new Error('storage unavailable');
  }
}
