import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from './base-response.dto.js';

export function ApiResponse<T>(ValueType: Type<T>) {
  class TypedResponse extends BaseResponseDto<T> {
    @ApiProperty({ type: () => ValueType, nullable: true })
    declare responseValue: T | null;
  }
  Object.defineProperty(TypedResponse, 'name', {
    value: `${ValueType.name}Response`,
  });
  return TypedResponse;
}
