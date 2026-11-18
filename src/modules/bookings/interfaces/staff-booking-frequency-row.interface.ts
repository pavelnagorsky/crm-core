import { BookingFrequencyRow } from './booking-frequency-row.interface.js';

/** A frequency row of one staff member's completed visits. */
export interface StaffBookingFrequencyRow extends BookingFrequencyRow {
  staffId: string;
}
