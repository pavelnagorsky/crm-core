import { File, Service, ServiceBundle, ServiceBundleItem } from '@prisma/client';

export interface ServiceBundleView extends ServiceBundle {
  imageFile: File | null;
  items: (ServiceBundleItem & { service: Service })[];
}
