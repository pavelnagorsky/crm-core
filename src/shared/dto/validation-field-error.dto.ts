import { ApiProperty } from '@nestjs/swagger';

export class ValidationFieldErrorDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'must be an email' })
  error: string;
}
