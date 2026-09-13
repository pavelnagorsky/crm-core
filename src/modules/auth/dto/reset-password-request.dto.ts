import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResetPasswordRequestDto {
  @ApiProperty({ type: String })
  @IsEmail()
  @MaxLength(60)
  email: string;
}
