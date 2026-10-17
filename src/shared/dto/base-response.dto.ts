import { ApiProperty } from '@nestjs/swagger';

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
