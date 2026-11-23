import { Prisma } from '@prisma/client';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../enums/staff-selection-mode.enum.js';
import { BookingStaffOption } from './booking-staff-option.interface.js';
import { BookingServiceStaff } from './booking-service-staff.interface.js';
import { ResolvedBookingItem } from './resolved-booking-item.interface.js';

export interface BookingSelectionResolution {
  availableServiceIds: string[];
  availableStaff: BookingStaffOption[];
  staffByService: BookingServiceStaff[];
  canAssignStaff: boolean;
  staffSelection: StaffSelectionMode;
  executionMode: BookingExecutionMode;
  totalDuration: number;
  totalListPrice: Prisma.Decimal;
  resolvedItems: ResolvedBookingItem[];
  /** Exact total of the preview (sum of the charged prices); null without a start time. */
  totalPrice: Prisma.Decimal | null;
}
