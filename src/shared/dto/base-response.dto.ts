import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '../validation/error-codes.enum.js';

export class BaseResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  isSuccess: boolean;

  @ApiProperty({ example: 'SUCCESS' })
  responseCode: string;

  @ApiProperty({ example: 'Success' })
  responseMessage: string;

  @ApiProperty({ nullable: true })
  responseValue: T | null;

  static success<T>(data: T | null = null): BaseResponseDto<T> {
    const res = new BaseResponseDto<T>();
    res.isSuccess = true;
    res.responseCode = 'SUCCESS';
    res.responseMessage = 'Success';
    res.responseValue = data;
    return res;
  }

  static failure<T = null>(
    code: string,
    message: string,
    value: T | null = null,
  ): BaseResponseDto<T> {
    const res = new BaseResponseDto<T>();
    res.isSuccess = false;
    res.responseCode = code;
    res.responseMessage = message;
    res.responseValue = value;
    return res;
  }
}

/**
 * Creates a concrete typed subclass so Swagger can reflect the `responseValue` type.
 * Usage: @ApiOkResponse({ type: ApiResponse(UserResponseDto) })
 */
export function ApiResponse<T>(ValueType: new (...args: any[]) => T) {
  class TypedResponse extends BaseResponseDto<T> {
    @ApiProperty({ type: () => ValueType, nullable: true })
    declare responseValue: T | null;
  }
  Object.defineProperty(TypedResponse, 'name', { value: `${ValueType.name}Response` });
  return TypedResponse;
}

export function ApiResponseArray<T>(ValueType: new (...args: any[]) => T) {
  class TypedResponse extends BaseResponseDto<T[]> {
    @ApiProperty({ type: () => ValueType, isArray: true, nullable: true })
    declare responseValue: T[] | null;
  }
  Object.defineProperty(TypedResponse, 'name', { value: `${ValueType.name}ArrayResponse` });
  return TypedResponse;
}
