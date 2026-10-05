import { ServiceWithStaffCount } from './service-with-staff-count.interface.js';

export interface ServiceForCatalog extends ServiceWithStaffCount {
  category: { name: string } | null;
}
