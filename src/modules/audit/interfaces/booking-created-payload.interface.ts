import { BookingCreatedItemPayload } from './booking-created-item-payload.interface.js';

export interface BookingCreatedPayload {
  items?: BookingCreatedItemPayload[];
  serviceName?: string;
  staffName?: string;
  startTime: string;
  endTime: string;
  price?: string;
  totalPrice?: string;
  currency: string;
  channel?: string;
  /** Status the booking was created with. */
  status?: string;
  isCustomTime?: boolean;
  executionMode?: string;
  bundleTitle?: string;
}
