import { applyDecorators, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';

export function Auth() {
  return applyDecorators(
    UseGuards(JwtAuthGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: 'Unauthorized', type: UnauthorizedException }),
  );
}
