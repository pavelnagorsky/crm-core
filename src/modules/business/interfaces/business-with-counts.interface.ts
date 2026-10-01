import { BusinessRole } from '@prisma/client';
import { BusinessWithLogo } from './business-with-logo.interface.js';

export interface BusinessWithCounts extends BusinessWithLogo {
  memberships: { role: BusinessRole }[];
  _count: { staff: number; services: number; clients: number };
}
