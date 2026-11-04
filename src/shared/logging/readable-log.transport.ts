import { join } from 'node:path';
import { writeSync } from 'node:fs';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import build from 'pino-abstract-transport';
import { prettyFactory } from 'pino-pretty';
import { createStream } from 'rotating-file-stream';
import { ReadableLogTransportOptions } from './interfaces/readable-log-transport-options.interface.js';

export default function readableLogTransport(
  options: ReadableLogTransportOptions,
) {
  const pretty = prettyFactory({
    colorize: false,
    translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l "UTC"',
    ignore: 'pid,hostname,context,requestId,req,res,responseTime',
    singleLine: true,
    messageFormat: (log, messageKey) =>
      `[${log.context ?? 'HTTP'}]${log.requestId ? ` requestId=${log.requestId}` : ''} ${log[messageKey] ?? ''}${log.responseTime !== undefined ? ` duration=${log.responseTime}ms` : ''}`,
  });
  const fileOptions = {
    path: options.directory,
    size: options.rotationSize ?? '20M',
    interval: '1d',
    intervalBoundary: true,
    intervalUTC: true,
    initialRotation: true,
    maxFiles: options.maxFiles ?? 14,
    compress: 'gzip' as const,
    mode: 0o640,
  };
  const openFile = (name: string) =>
    createStream(
      (time, index) =>
        time instanceof Date
          ? join(
              'archive',
              `${name}.${time.toISOString().replaceAll(':', '-')}.${index}.gz`,
            )
          : name,
      { ...fileOptions, history: `${name}.history` },
    );
  const app = options.directory ? openFile('app.log') : undefined;
  const errors = options.directory ? openFile('errors.log') : undefined;
  const files = [app, errors].filter((file) => file !== undefined);
  const output = build(
    async (source) => {
      for await (const log of source) {
        const line = pretty(log);
        const destinations: Writable[] = [];
        if (options.stdout !== false) writeSync(1, line);
        if (app) destinations.push(app);
        if (errors && log.level >= 50) destinations.push(errors);
        await Promise.all(
          destinations.map(
            (destination) =>
              new Promise<void>((resolve, reject) => {
                destination.write(line, (error) =>
                  error ? reject(error) : resolve(),
                );
              }),
          ),
        );
      }
    },
    {
      close: async () => {
        await Promise.all(
          files.map((file) => {
            const complete = finished(file);
            file.end();
            return complete;
          }),
        );
      },
    },
  );
  for (const file of files) file.on('error', (error) => output.destroy(error));
  return output;
}
