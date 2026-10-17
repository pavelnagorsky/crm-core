import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '../validation/error-codes.enum.js';
import { BaseResponseDto } from './base-response.dto.js';

export class UnauthorizedResponseDto extends BaseResponseDto<null> {
  @ApiProperty({ example: false })
  declare isSuccess: boolean;

  @ApiProperty({
    enum: [ErrorCode.UNAUTHORIZED.code],
    example: ErrorCode.UNAUTHORIZED.code,
  })
  declare responseCode: string;

  @ApiProperty({ example: 'Unauthorized' })
  declare responseMessage: string;

  @ApiProperty({ nullable: true, example: null })
  declare responseValue: null;
}
