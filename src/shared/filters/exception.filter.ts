import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { BaseResponseDto } from '../dto/base-response.dto.js';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../validation/error-codes.enum.js';

const HTTP_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST.code,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED.code,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN.code,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND.code,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse();
    const ctx = `${req.method} ${req.url}`;

    if (exception instanceof AppException) {
      this.logger.warn(`[${ctx}] AppException ${exception.errorCode} (${exception.getStatus()})`);
      res
        .status(exception.getStatus())
        .json(BaseResponseDto.failure(exception.errorCode, exception.message, exception.payload));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = HTTP_CODE_MAP[status] ?? ErrorCode.INTERNAL_ERROR;
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as any)?.message ?? exception.message;
      if (status >= 500) {
        this.logger.error(`[${ctx}] HttpException ${status}: ${message}`);
      }
      res.status(status).json(BaseResponseDto.failure(code, String(message)));
      return;
    }

    this.logger.error(
      `[${ctx}] Unhandled exception`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(BaseResponseDto.failure(ErrorCode.INTERNAL_ERROR.code, ErrorCode.INTERNAL_ERROR.message));
  }
}
