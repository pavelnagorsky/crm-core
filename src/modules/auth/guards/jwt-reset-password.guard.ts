import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtResetPasswordGuard extends AuthGuard('reset-password-jwt') {}
