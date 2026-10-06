import { Brand, File, Location } from '@prisma/client';

export interface LocationPublicProfile extends Location {
  brand: Brand & { logoFile: File | null };
}
