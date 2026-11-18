import { Prisma } from '@prisma/client';
import { LocationProductView } from './location-product-view.interface.js';

/** A location product that can be sold: it is for sale and has a retail price. */
export interface SellableLocationProductView extends LocationProductView {
  retailPrice: Prisma.Decimal;
}
