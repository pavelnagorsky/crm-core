import { ServicePriceLineRequest } from './service-price-line-request.interface.js';

/** Service lines of one visit in booking order; bundle lines in the bundle item order. */
export interface ServicePriceRequest {
  bundleId: string | null;
  lines: ServicePriceLineRequest[];
}
