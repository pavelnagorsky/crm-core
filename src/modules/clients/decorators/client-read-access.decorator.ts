import { applyDecorators, ForbiddenException, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { ClientReadGuard } from '../guards/client-read.guard.js';

/** client:read on the brand, or booking:write / booking.own:write in any of its locations. */
export function ClientReadAccess() {
  return applyDecorators(
    Auth(),
    UseGuards(ClientReadGuard),
    ApiForbiddenResponse({
      description:
        'Requires client:read on the brand, or booking:write / booking.own:write in one of its locations',
      type: ForbiddenException,
    }),
  );
}
