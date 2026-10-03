import { CorsOptions, CorsOptionsDelegate, CorsRequest } from 'cors';
import { corsConfig } from './cors.config.js';

const publicCors: CorsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

export function isPublicApiPath(path: string): boolean {
  return path === '/public' || path.startsWith('/public/') || path.endsWith('/public') || path.includes('/public/');
}

export function corsFor(path: string): CorsOptions {
  return isPublicApiPath(path) ? publicCors : corsConfig;
}

export const corsOptionsDelegate: CorsOptionsDelegate = (req, callback) => {
  const path = (req as CorsRequest & { path?: string }).path ?? '';
  callback(null, corsFor(path));
};
