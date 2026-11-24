import { BookingItem, BookingItemPriceAdjustment } from '@prisma/client';

/**
 * A booking item as responses read it. Reads through bookingWithItemsInclude carry the price
 * layers; an item read without them shows no layers.
 */
export interface BookingItemWithAdjustments extends BookingItem {
  priceAdjustments?: BookingItemPriceAdjustment[];
}
