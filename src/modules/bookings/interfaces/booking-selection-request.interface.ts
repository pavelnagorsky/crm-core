import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';

export interface BookingSelectionRequest {
  serviceId?: string;
  serviceIds?: string[];
  bundleId?: string | null;
  executionMode?: BookingExecutionMode;
  items?: ManualBookingItemDto[];
}
