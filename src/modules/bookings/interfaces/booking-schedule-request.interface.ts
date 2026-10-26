import { BookingExecutionMode } from '@prisma/client';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingServiceSnapshot } from './booking-service-snapshot.interface.js';

export interface BookingScheduleRequest {
  locationId: string;
  services: BookingServiceSnapshot[];
  startAt: Date;
  executionMode: BookingExecutionMode;
  requestedStaffId?: string;
  timezone: string;
  manualItems: ManualBookingItemDto[];
  customEndAt: Date | null;
}
