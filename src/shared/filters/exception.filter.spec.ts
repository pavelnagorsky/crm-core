import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { vi } from 'vitest';
import { GlobalExceptionFilter } from './exception.filter.js';

describe('GlobalExceptionFilter', () => {
  it.each([400, 401, 403, 404, 409, 429])(
    'logs HTTP %s rejections without query credentials or exception details',
    (statusCode) => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      try {
        const host = {
          switchToHttp: () => ({
            getRequest: () => ({
              method: 'POST',
              url: '/auth/yandex?token=private-token',
            }),
            getResponse: () => ({
              status: vi.fn().mockReturnValue({ json: vi.fn() }),
            }),
          }),
        } as unknown as ArgumentsHost;
        new GlobalExceptionFilter().catch(
          new HttpException('private error details', statusCode),
          host,
        );
        expect(warn).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(
            new RegExp(
              `^\\[POST /auth/yandex\\] HttpException .* \\(${statusCode}\\)$`,
            ),
          ),
        );
        expect(warn.mock.calls.flat().join(' ')).not.toContain('private');
      } finally {
        warn.mockRestore();
      }
    },
  );

  it('uses a string response code for unmapped HTTP statuses', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/conflict' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new HttpException('Conflict', HttpStatus.CONFLICT),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        responseCode: 'INTERNAL_ERROR',
        responseMessage: 'Conflict',
      }),
    );
  });
});
