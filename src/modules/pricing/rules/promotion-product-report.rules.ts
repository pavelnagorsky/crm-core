import { Prisma } from '@prisma/client';
import { PROMOTION_REPORT_PRODUCT_LIMIT } from '../constants/price-rule.constants.js';
import { PromotionFullReport } from '../interfaces/promotion-full-report.interface.js';
import { PromotionProductLine } from '../interfaces/promotion-product-line.interface.js';
import { PromotionProductReport } from '../interfaces/promotion-product-report.interface.js';
import { PromotionProductStats } from '../interfaces/promotion-product-stats.interface.js';
import { PromotionReport } from '../interfaces/promotion-report.interface.js';
import { PromotionReportProduct } from '../interfaces/promotion-report-product.interface.js';
import { PromotionReportStaffRow } from '../interfaces/promotion-report-staff-row.interface.js';
import { PromotionSellerRevenue } from '../interfaces/promotion-seller-revenue.interface.js';
import { PromotionStaffInfo } from '../interfaces/promotion-staff-info.interface.js';

const ZERO = new Prisma.Decimal(0);

/** What a line kept after its posted returns: revenue, discount, quantity. */
function net(line: PromotionProductLine): {
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
  quantity: Prisma.Decimal;
} {
  return {
    revenue: line.lineTotal.minus(line.returnedTotal),
    discount: line.discountTotal.minus(line.returnedDiscount),
    quantity: line.quantity.minus(line.returnedQuantity),
  };
}

/** Separate sales among the lines: orders without a booking. */
function salesOf(lines: readonly PromotionProductLine[]): number {
  return new Set(
    lines.filter((line) => line.bookingId === null).map((line) => line.orderId),
  ).size;
}

/**
 * Product lines with a promotion together, net of returns (docs/pricing-stage7-api.md):
 * revenue and discount minus what the returns of the lines took back, separate sales.
 */
export function promotionProductStats(
  lines: readonly PromotionProductLine[],
): PromotionProductStats {
  let revenue = ZERO;
  let discount = ZERO;
  for (const line of lines) {
    const kept = net(line);
    revenue = revenue.plus(kept.revenue);
    discount = discount.plus(kept.discount);
  }
  return { revenue, discount, salesCount: salesOf(lines) };
}

/** The same per promotion; a line with two PROMOTION layers counts for each. */
export function promotionProductStatsByRule(
  lines: readonly PromotionProductLine[],
): Map<string, PromotionProductStats> {
  const byRule = new Map<string, PromotionProductLine[]>();
  for (const line of lines)
    for (const ruleId of new Set(line.ruleIds))
      byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), line]);
  return new Map(
    [...byRule.entries()].map(([ruleId, ruleLines]) => [
      ruleId,
      promotionProductStats(ruleLines),
    ]),
  );
}

/**
 * Product part of the promotion page: totals net of returns, the returned amount, separate
 * sales, the clients of the lines, the top products by revenue and the revenue per seller.
 */
export function promotionProductReport(
  lines: readonly PromotionProductLine[],
  limit = PROMOTION_REPORT_PRODUCT_LIMIT,
): PromotionProductReport {
  const totals = promotionProductStats(lines);
  const products = new Map<string, PromotionReportProduct>();
  const sellers = new Map<string, PromotionSellerRevenue>();
  let returned = ZERO;
  for (const line of lines) {
    const kept = net(line);
    returned = returned.plus(line.returnedTotal);
    const key = line.productId ?? `title:${line.title}`;
    const product = products.get(key) ?? {
      productId: line.productId ?? '',
      title: line.title,
      quantity: ZERO,
      revenue: ZERO,
      discount: ZERO,
    };
    product.quantity = product.quantity.plus(kept.quantity);
    product.revenue = product.revenue.plus(kept.revenue);
    product.discount = product.discount.plus(kept.discount);
    products.set(key, product);
    if (line.sellerStaffId !== null) {
      const seller = sellers.get(line.sellerStaffId) ?? {
        staffId: line.sellerStaffId,
        name: line.sellerName ?? '',
        revenue: ZERO,
      };
      seller.revenue = seller.revenue.plus(kept.revenue);
      sellers.set(line.sellerStaffId, seller);
    }
  }
  return {
    revenue: totals.revenue,
    discount: totals.discount,
    returned,
    salesCount: totals.salesCount,
    clientIds: [
      ...new Set(
        lines.flatMap((line) => (line.clientId === null ? [] : [line.clientId])),
      ),
    ],
    products: [...products.values()]
      .sort(
        (a, b) =>
          b.revenue.comparedTo(a.revenue) || a.title.localeCompare(b.title, 'ru'),
      )
      .slice(0, limit),
    sellers: [...sellers.values()],
  };
}

/**
 * The promotion page over visits and products (docs/pricing-stage7-api.md): revenue and
 * discount add the products net of returns; clients are the distinct clients of the
 * bookings and the product lines; staff get their product revenue as sellers, a seller
 * without promotion visits gets a row with bookingsCount 0. New clients, return rate and
 * "not returned" stay by bookings.
 */
export function mergePromotionReport(
  report: PromotionReport,
  products: PromotionProductReport,
  bookingClientIds: readonly string[],
  staffInfo: ReadonlyMap<string, PromotionStaffInfo>,
): PromotionFullReport {
  const clients = new Set([...bookingClientIds, ...products.clientIds]);
  const clientsCount = Math.max(clients.size, report.clientsCount);
  const sellers = new Map(
    products.sellers.map((seller) => [seller.staffId, seller]),
  );
  const staff: PromotionReportStaffRow[] = report.staff.map((row) => ({
    ...row,
    productsRevenue: sellers.get(row.staffId)?.revenue ?? ZERO,
  }));
  const listed = new Set(report.staff.map((row) => row.staffId));
  for (const seller of products.sellers) {
    if (listed.has(seller.staffId)) continue;
    const info = staffInfo.get(seller.staffId);
    staff.push({
      staffId: seller.staffId,
      name: info?.name ?? seller.name,
      avatarUrl: info?.avatarUrl ?? null,
      bookingsCount: 0,
      revenue: ZERO,
      discount: ZERO,
      productsRevenue: seller.revenue,
    });
  }
  staff.sort(
    (a, b) =>
      b.bookingsCount - a.bookingsCount ||
      b.productsRevenue.comparedTo(a.productsRevenue) ||
      a.name.localeCompare(b.name),
  );
  return {
    ...report,
    revenue: report.revenue.plus(products.revenue),
    discount: report.discount.plus(products.discount),
    servicesRevenue: report.revenue,
    productsRevenue: products.revenue,
    productsDiscount: products.discount,
    productsReturned: products.returned,
    salesCount: products.salesCount,
    products: products.products,
    clientsCount,
    returningClients: clientsCount - report.newClients,
    staff,
  };
}
