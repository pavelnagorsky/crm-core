import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseResponseDto } from '../dto/base-response.dto.js';
import { AppException } from '../exceptions/app.exception.js';
import { ErrorCode } from '../validation/error-codes.enum.js';

const HTTP_CODE_MAP: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();

    if (exception instanceof AppException) {
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
      res.status(status).json(BaseResponseDto.failure(code, String(message)));
      return;
    }

    this.logger.error(exception);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(BaseResponseDto.failure(ErrorCode.INTERNAL_ERROR, 'Internal server error'));
  }
}
