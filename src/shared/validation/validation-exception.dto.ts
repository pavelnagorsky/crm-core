import { ApiProperty } from '@nestjs/swagger';
import { BaseResponseDto } from '../dto/base-response.dto.js';
import { ErrorCode } from './error-codes.enum.js';

export class ValidationFieldErrorDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'must be an email' })
  error: string;
}

export class UnauthorizedResponseDto extends BaseResponseDto<null> {
  @ApiProperty({ example: false })
  declare isSuccess: boolean;

  @ApiProperty({ enum: ErrorCode, example: ErrorCode.UNAUTHORIZED })
  declare responseCode: string;

  @ApiProperty({ example: 'Unauthorized' })
  declare responseMessage: string;

  @ApiProperty({ nullable: true, example: null })
  declare responseValue: null;
}

export class ValidationErrorResponseDto extends BaseResponseDto<ValidationFieldErrorDto[]> {
  @ApiProperty({ example: false })
  declare isSuccess: boolean;

  @ApiProperty({ enum: ErrorCode, example: ErrorCode.VALIDATION_ERROR })
  declare responseCode: string;

  @ApiProperty({ example: 'Validation failed' })
  declare responseMessage: string;

  @ApiProperty({ type: () => ValidationFieldErrorDto, isArray: true, nullable: true })
  declare responseValue: ValidationFieldErrorDto[] | null;
}
