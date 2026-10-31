import { BookingStaffOption } from './booking-staff-option.interface.js';

export interface BookingServiceStaff {
  serviceId: string;
  availableStaff: BookingStaffOption[];
}
