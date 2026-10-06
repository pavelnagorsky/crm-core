import { BusinessRole } from '@prisma/client';
import { BrandWithLogo } from './brand-with-logo.interface.js';

export interface BrandWithCounts extends BrandWithLogo {
  brandMemberships: { role: BusinessRole }[];
  _count: { locations: number; clients: number };
}
