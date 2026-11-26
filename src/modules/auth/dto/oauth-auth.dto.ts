import { ApiProperty } from '@nestjs/swagger';
import { AuthDto } from './auth.dto.js';

/** Social sign-in: one endpoint both signs in and registers. */
export class OAuthAuthDto extends AuthDto {
  @ApiProperty({
    type: Boolean,
    description:
      'True when this request created the account (registration), false for a sign-in to an existing account. Used for registration analytics.',
  })
  isNewUser: boolean;

  constructor(accessToken: string, isNewUser: boolean) {
    super(accessToken);
    this.isNewUser = isNewUser;
  }
}
