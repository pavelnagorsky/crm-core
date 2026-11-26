import { PromotionSkip } from '../../pricing/engine/interfaces/promotion-skip.interface.js';
import { ServiceDiscountOption } from '../../pricing/interfaces/service-discount-option.interface.js';
import { ServicePriceAdjustment } from '../../pricing/interfaces/service-price-adjustment.interface.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { Prisma } from '@prisma/client';
import { BookingLineStaffSource } from '../enums/booking-line-staff-source.enum.js';

/** A priced line of the booking preview (services and products). */
export interface BookingPricingLine extends OrderPricingLine {
  discount: ServicePriceAdjustment | null;
  /** Cabinet only: discounts that apply, best first. */
  eligible: ServiceDiscountOption[];
  /** Cabinet only: promotions on the service that do not apply. */
  ineligible: PromotionSkip[];
  /** Service lines only: the staff member the line is priced with; null when none can take it. */
  staffId?: string | null;
  staffName?: string | null;
  /** Service lines only: how staffId was found; null without a staff member. */
  staffSource?: BookingLineStaffSource | null;
  /** Product lines only: the discount layer (empty online, titles are internal). */
  adjustments?: ServicePriceAdjustment[];
  /** Product lines only, cabinet: the choice the line was priced with; null = AUTO. */
  promotion?: LineDiscountChoice | null;
  /** Product lines only, cabinet with Read(INVENTORY): the last purchase price. */
  lastPurchaseUnitCost?: Prisma.Decimal | null;
  /** Product lines only, cabinet: lineTotal below the last purchase price. */
  belowCost?: boolean;
}
