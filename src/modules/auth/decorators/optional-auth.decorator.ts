import {
  applyDecorators,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard.js';

export function OptionalAuth() {
  return applyDecorators(
    UseGuards(OptionalJwtAuthGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Authorization header was sent but the token is invalid',
      type: UnauthorizedException,
    }),
  );
}
