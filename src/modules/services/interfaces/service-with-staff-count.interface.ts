import { ServiceWithImage } from './service-with-image.interface.js';

export interface ServiceWithStaffCount extends ServiceWithImage {
  _count: { staffServices: number };
}
