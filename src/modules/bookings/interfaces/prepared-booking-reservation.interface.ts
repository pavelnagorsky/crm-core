import { BookingExecutionMode } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ManualBookingProductDto } from '../dto/manual-booking-product.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingAttribution } from './booking-attribution.interface.js';
import { ResolvedBookingClient } from './resolved-booking-client.interface.js';
import { ResolvedBookingItem } from './resolved-booking-item.interface.js';

export interface PreparedBookingReservation {
  locationId: string;
  timezone: string;
  client: ResolvedBookingClient;
  items: ResolvedBookingItem[];
  attribution: BookingAttribution;
  executionMode: BookingExecutionMode;
  bundleId: string | null;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  isCustomTime: boolean;
  notes: string | null;
  internalNotes: string | null;
  products: ManualBookingProductDto[];
  actor: AuditActor | null;
}
