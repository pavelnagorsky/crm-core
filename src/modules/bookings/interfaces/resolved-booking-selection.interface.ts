import { BookingExecutionMode } from '@prisma/client';
import { BookingServiceSnapshot } from './booking-service-snapshot.interface.js';

export interface ResolvedBookingSelection {
  services: BookingServiceSnapshot[];
  executionMode: BookingExecutionMode;
  bundleId: string | null;
  bundleTitle: string | null;
}
