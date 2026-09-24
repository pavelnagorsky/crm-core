import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { BaseResponseDto } from '../dto/base-response.dto.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<BaseResponseDto | StreamableFile> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile || data instanceof BaseResponseDto) return data;
        return BaseResponseDto.success(data ?? null);
      }),
    );
  }
}
