import { ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Params } from 'nestjs-pino';
import { requestId } from '../shared/logging/request-id.js';
import { LoggingConfig } from './interfaces/logging-config.interface.js';

export function loggerConfig(config: ConfigService): Params {
  const logging = config.getOrThrow<LoggingConfig>('logging');
  return {
    pinoHttp: {
      level: logging.level,
      genReqId: requestId,
      customProps: (req) => ({ requestId: req.id }),
      serializers: {
        req: (req: IncomingMessage) => ({
          method: req.method,
          url: req.url?.split('?')[0],
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        err: (error: Error) => ({
          type: error.name,
          message: error.message,
          stack: error.stack,
        }),
      },
      redact: {
        paths: [
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'authorization',
          'cookie',
        ],
        censor: '[REDACTED]',
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info',
      customSuccessMessage: (req, res) =>
        `${req.method} ${req.url?.split('?')[0]} status=${res.statusCode}`,
      customErrorMessage: (req, res) =>
        `${req.method} ${req.url?.split('?')[0]} status=${res.statusCode}`,
      transport:
        process.env.NODE_ENV === 'test'
          ? undefined
          : {
              target: fileURLToPath(
                new URL(
                  '../shared/logging/readable-log.transport.js',
                  import.meta.url,
                ),
              ),
              options: { directory: logging.directory },
            },
    },
  };
}
