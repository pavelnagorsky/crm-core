import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendConfirmationEmailDto {
  @ApiProperty({ type: String })
  @IsEmail()
  @MaxLength(254)
  email: string;
}
