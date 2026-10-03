import { Request } from 'express';

export function clientIp(req: Request): string {
  const ip = req.ips?.[0] || req.ip || 'unknown';
  return ip.slice(0, 64);
}

export function requestOrigin(req: Request): string | undefined {
  const origin = singleHeader(req.headers.origin);
  if (origin && origin !== 'null') return origin;
  const referer = singleHeader(req.headers.referer);
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
