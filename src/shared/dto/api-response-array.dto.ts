import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from './base-response.dto.js';

export function ApiResponseArray<T>(ValueType: Type<T>) {
  class TypedResponse extends BaseResponseDto<T[]> {
    @ApiProperty({ type: () => ValueType, isArray: true, nullable: true })
    declare responseValue: T[] | null;
  }
  Object.defineProperty(TypedResponse, 'name', {
    value: `${ValueType.name}ArrayResponse`,
  });
  return TypedResponse;
}
