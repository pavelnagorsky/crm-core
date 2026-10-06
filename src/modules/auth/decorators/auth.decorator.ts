import {
  applyDecorators,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../guards/token-epoch.guard.js';

export function Auth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, TokenEpochGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Unauthorized',
      type: UnauthorizedException,
    }),
  );
}
