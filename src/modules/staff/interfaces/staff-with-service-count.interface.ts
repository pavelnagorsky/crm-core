import { StaffWithAvatar } from './staff-with-avatar.interface.js';

export interface StaffWithServiceCount extends StaffWithAvatar {
  _count: { staffServices: number };
  staffServices: { serviceId: string }[];
}
