import { Business, File } from '@prisma/client';

export interface BusinessWithLogo extends Business {
  logoFile: File | null;
}
