import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import regularExpressions from '../regular-expressions.js';

export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && regularExpressions.requestId.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}
