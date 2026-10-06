import { BusinessRole } from '@prisma/client';
import { BusinessWithLogo } from './business-with-logo.interface.js';

export interface BusinessWithCounts extends BusinessWithLogo {
  brandMemberships: { role: BusinessRole }[];
  _count: { locations: number; clients: number };
}
