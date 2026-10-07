import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { vi } from 'vitest';
import { GlobalExceptionFilter } from './exception.filter.js';

describe('GlobalExceptionFilter', () => {
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
