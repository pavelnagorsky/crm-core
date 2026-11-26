import { BookingExecutionMode, Prisma } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ManualBookingProductDto } from '../dto/manual-booking-product.dto.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingTraffic } from './booking-traffic.interface.js';
import { ResolvedBookingChannel } from './resolved-booking-channel.interface.js';
import { ResolvedBookingClient } from './resolved-booking-client.interface.js';
import { ResolvedBookingItem } from './resolved-booking-item.interface.js';
import { BookingCreationRequest } from './booking-creation-request.interface.js';
import { ClientNoticeState } from './client-notice-state.interface.js';
import { VisitPaymentPlan } from './visit-payment-plan.interface.js';

export interface PreparedBookingReservation {
  locationId: string;
  timezone: string;
  client: ResolvedBookingClient;
  /** Email to save to the client profile, only if it has none, in the booking transaction. */
  clientEmailToFill?: string | null;
  items: ResolvedBookingItem[];
  attribution: ResolvedBookingChannel;
  traffic: BookingTraffic;
  executionMode: BookingExecutionMode;
  bundleId: string | null;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  isCustomTime: boolean;
  notifyClient: boolean;
  clientNotice: ClientNoticeState;
  notes: string | null;
  internalNotes: string | null;
  products: ManualBookingProductDto[];
  /** sale.price.override:write: custom prices and discount picks of the products. */
  canOverridePrice?: boolean;
  actor: AuditActor | null;
  request?: BookingCreationRequest;
  /** Products to confirm and the payment, after the booking in the same transaction. */
  paymentPlan?: VisitPaymentPlan | null;
  /** Promo code the visit (services or products) was priced with and applied, upper case. */
  promoCode?: string | null;
  /**
   * Runs under the location lock before the slots: re-checks the limits of the promotions the
   * items and products use, when they were not counted in this transaction.
   */
  limitGuard?: (tx: Prisma.TransactionClient) => Promise<void>;
}
