import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { BaseResponseDto } from '../dto/base-response.dto.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<BaseResponseDto> {
    return next.handle().pipe(
      map((data) => (data instanceof BaseResponseDto ? data : BaseResponseDto.success(data ?? null))),
    );
  }
}
