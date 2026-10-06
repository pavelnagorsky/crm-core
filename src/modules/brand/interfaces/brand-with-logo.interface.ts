import { Brand, File } from '@prisma/client';

export interface BrandWithLogo extends Brand {
  logoFile: File | null;
}
