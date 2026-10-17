import { BrandWithLogo } from './brand-with-logo.interface.js';

export interface BrandWithCounts extends BrandWithLogo {
  _count: { locations: number; clients: number };
}
