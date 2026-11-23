import { PricedSlot } from './priced-slot.interface.js';

export interface PricedSlotsDay {
  /** YYYY-MM-DD in the location timezone. */
  date: string;
  slots: PricedSlot[];
}
