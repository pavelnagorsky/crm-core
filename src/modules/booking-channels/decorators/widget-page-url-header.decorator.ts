import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const WidgetPageUrlHeader = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().get('X-Widget-Page-Url'),
);
