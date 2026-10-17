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
  source?: string;
  executionMode?: string;
  bundleTitle?: string;
}
