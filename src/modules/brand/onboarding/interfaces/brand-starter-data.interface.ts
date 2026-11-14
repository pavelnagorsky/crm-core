import { Location, Service, ServiceCategory, Staff } from '@prisma/client';

export interface BrandStarterData {
  location: Location;
  categories: ServiceCategory[];
  services: Service[];
  staff: Staff;
}
