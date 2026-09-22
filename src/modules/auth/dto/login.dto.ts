import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ type: String })
  @IsEmail()
  email: string;

  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(50)
  password: string;
}
