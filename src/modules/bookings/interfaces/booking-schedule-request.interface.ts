import { AnyStaffRule, BookingExecutionMode } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { StaffAssignment } from '../../../shared/scheduling/interfaces/staff-assignment.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingServiceSnapshot } from './booking-service-snapshot.interface.js';

export interface BookingScheduleRequest {
  locationId: string;
  /** Bundle the services come from, in the bundle item order; null for separate services. */
  bundleId: string | null;
  services: BookingServiceSnapshot[];
  /** FRESH when the items are stored with their prices, CACHED for a preview. */
  prices: ReadConsistency;
  startAt: Date;
  executionMode: BookingExecutionMode;
  requestedStaffId?: string;
  staffAssignments?: StaffAssignment[];
  timezone: string;
  manualItems: ManualBookingItemDto[];
  customEndAt: Date | null;
  /** Assign qualified staff even when busy or off shift; free staff are still preferred. */
  allowConflicts?: boolean;
  /** Staff member ranked first for every service they can take, after free over busy. */
  preferredStaffId?: string;
  /** Per item (services order): the staff member the guest saw with the slot, ranked first for that item. */
  preferredStaffIds?: string[];
  /** Location rule that orders the candidates of "any staff" (Location.anyStaffRule). */
  staffRule: AnyStaffRule;
  /** Promotions and the client discount (docs/pricing-stage4-api.md); none without it. */
  pricingContext?: QuoteContext | null;
}
