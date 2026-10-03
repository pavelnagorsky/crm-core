import { CorsOptions, CorsOptionsDelegate, CorsRequest } from 'cors';
import { corsConfig } from './cors.config.js';

const EMBEDDABLE_BOOKING_PATHS = [
  /^\/public\/booking-pages\/[^/]+$/,
  /^\/public\/booking-widgets\/[^/]+$/,
  /^\/public\/bookings$/,
  /^\/public\/businesses\/[^/]+\/booking-setup$/,
  /^\/businesses\/[^/]+\/public$/,
  /^\/businesses\/[^/]+\/calendar\/public\/available-slots$/,
];

const embeddableBookingCors: CorsOptions = {
  origin: true,
  credentials: false,
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

export function isEmbeddableBookingPath(path: string): boolean {
  return EMBEDDABLE_BOOKING_PATHS.some((pattern) => pattern.test(path));
}

export const corsOptionsDelegate: CorsOptionsDelegate = (req, callback) => {
  const path = (req as CorsRequest & { path?: string }).path ?? '';
  if (isEmbeddableBookingPath(path)) {
    callback(null, embeddableBookingCors);
    return;
  }
  callback(null, corsConfig);
};
