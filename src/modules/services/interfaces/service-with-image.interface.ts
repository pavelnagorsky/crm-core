import { File, Service } from '@prisma/client';

export interface ServiceWithImage extends Service {
  imageFile: File | null;
}
