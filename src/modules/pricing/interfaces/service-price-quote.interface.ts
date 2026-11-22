import { ServiceLinePrice } from './service-line-price.interface.js';

export interface ServicePriceQuote {
  /** In request order. */
  lines: ServiceLinePrice[];
}
