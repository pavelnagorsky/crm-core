import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '../validation/error-codes.enum.js';
import { BaseResponseDto } from './base-response.dto.js';
import { ValidationFieldErrorDto } from './validation-field-error.dto.js';

export class ValidationErrorResponseDto extends BaseResponseDto<
  ValidationFieldErrorDto[]
> {
  @ApiProperty({ example: false })
  declare isSuccess: boolean;

  @ApiProperty({
    enum: [ErrorCode.VALIDATION_ERROR.code],
    example: ErrorCode.VALIDATION_ERROR.code,
  })
  declare responseCode: string;

  @ApiProperty({ example: 'Validation failed' })
  declare responseMessage: string;

  @ApiProperty({
    type: () => ValidationFieldErrorDto,
    isArray: true,
    nullable: true,
  })
  declare responseValue: ValidationFieldErrorDto[] | null;
}
