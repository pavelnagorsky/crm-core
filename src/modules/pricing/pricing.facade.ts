import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PriceAdjustmentKind as PrismaPriceAdjustmentKind,
  PriceValueType as PrismaPriceValueType,
  Prisma,
} from '@prisma/client';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../shared/money/money.utils.js';
import { TimeUtils } from '../../shared/time/time.utils.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { BundlePricingMode } from './engine/enums/bundle-pricing-mode.enum.js';
import { DiscountChoiceMode } from './engine/enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from './engine/enums/price-adjustment-kind.enum.js';
import { PriceRuleSkipReason } from './engine/enums/price-rule-skip-reason.enum.js';
import { LineQuote } from './engine/interfaces/line-quote.interface.js';
import { DiscountCandidate } from './engine/interfaces/discount-candidate.interface.js';
import { PriceAdjustment } from './engine/interfaces/price-adjustment.interface.js';
import { ProductLineQuote } from './engine/interfaces/product-line-quote.interface.js';
import { ProductQuoteRequest } from './engine/interfaces/product-quote-request.interface.js';
import { ProductsQuote } from './engine/interfaces/products-quote.interface.js';
import { VisitTime } from './engine/interfaces/visit-time.interface.js';
import { QuoteContext } from './engine/interfaces/quote-context.interface.js';
import { VisitQuote } from './engine/interfaces/visit-quote.interface.js';
import { PriceBook } from './engine/price-book.js';
import { ProductLinePrice } from './interfaces/product-line-price.interface.js';
import { ProductPriceExplanation } from './interfaces/product-price-explanation.interface.js';
import { ProductPriceLineRequest } from './interfaces/product-price-line-request.interface.js';
import { ProductPriceQuote } from './interfaces/product-price-quote.interface.js';
import { ProductPriceRequest } from './interfaces/product-price-request.interface.js';
import { PromotionNotApplicable } from './interfaces/promotion-not-applicable.interface.js';
import { ServiceDiscountOption } from './interfaces/service-discount-option.interface.js';
import { ServiceLinePrice } from './interfaces/service-line-price.interface.js';
import { ServicePriceAdjustment } from './interfaces/service-price-adjustment.interface.js';
import { ServicePriceQuote } from './interfaces/service-price-quote.interface.js';
import { ServicePriceRequest } from './interfaces/service-price-request.interface.js';
import { UnpriceableLines } from './interfaces/unpriceable-lines.interface.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';

const QUANTITY_SCALE = 3;

/** Prices and promotions: the one place that computes what a sale line costs. */
@Injectable()
export class PricingFacade {
  constructor(private readonly snapshots: PricingSnapshotService) {}

  /**
   * Price layers of the service lines of one visit, surcharges by `request.visit`,
   * discounts by `request.context`. FRESH when the result is stored (booking creation),
   * CACHED when it is only shown.
   */
  async quoteServices(
    locationId: string,
    request: ServicePriceRequest,
    consistency: ReadConsistency,
  ): Promise<ServicePriceQuote> {
    return this.quoteWithBook(
      await this.priceBook(locationId, consistency),
      request,
    );
  }

  /**
   * Same as quoteServices over a price book the caller already loaded, so one request
   * ranks staff and quotes the visit from a single snapshot. A discount an administrator
   * picked (context.choice RULE or CLIENT_DISCOUNT) that does not apply to its line is a
   * 409 PROMOTION_NOT_APPLICABLE with { lineIndex, ruleId, reason }; a stored one
   * (fallbackToAuto) gives the line the best discount instead.
   */
  quoteWithBook(
    book: PriceBook,
    request: ServicePriceRequest,
  ): ServicePriceQuote {
    this.assertPriceable(
      book,
      request.bundleId,
      request.lines.map((line) => line.serviceId),
    );
    const context = request.context ?? null;
    const quote = book.quote({
      bundleId: request.bundleId,
      lines: request.lines.map((line) => ({
        serviceId: line.serviceId,
        staffId: line.staffId,
        customPrice:
          line.customPrice === null
            ? null
            : MoneyUtils.toMinor(line.customPrice),
      })),
      visit: request.visit,
      context,
    });
    if (context !== null) this.assertChoices(quote, context);
    return this.toQuote(quote);
  }

  /**
   * Product lines of one visit order or sale (docs/pricing-stage7-api.md): retail price of
   * the date, one best discount per line, custom price. FRESH when the result is stored
   * (confirmation), CACHED when it is only shown or kept in a draft.
   */
  async quoteProducts(
    locationId: string,
    request: ProductPriceRequest,
    consistency: ReadConsistency,
  ): Promise<ProductPriceQuote> {
    return this.quoteProductsWithBook(
      await this.priceBook(locationId, consistency),
      request,
    );
  }

  /**
   * Same as quoteProducts over a price book the caller already loaded (a booking window
   * prices services and products from one snapshot). A product the book does not sell is a
   * 409 ORDER_PRODUCT_NOT_SELLABLE. A discount an administrator picked that does not apply
   * is a 409 PROMOTION_NOT_APPLICABLE with { lineIndex, ruleId, reason, productId }; a stored
   * one (fallbackToAuto) gives the line the best discount instead.
   */
  quoteProductsWithBook(
    book: PriceBook,
    request: ProductPriceRequest,
  ): ProductPriceQuote {
    const engineRequest = this.productEngineRequest(book, request);
    const quote = book.quoteProducts(engineRequest);
    if (request.context !== null)
      this.assertProductChoices(quote, request.context);
    return this.toProductQuote(quote);
  }

  /**
   * One product line and every promotion that did not reach it (pricing/explain). Choices are
   * not checked: explain shows what AUTO gives.
   */
  explainProduct(
    book: PriceBook,
    line: ProductPriceLineRequest,
    time: VisitTime,
    context: QuoteContext | null,
    otherListTotal: Prisma.Decimal,
  ): ProductPriceExplanation {
    const request = this.productEngineRequest(book, {
      lines: [line],
      time,
      context,
      otherListTotal,
    });
    const explanation = book.explainProduct(
      request.lines[0],
      time,
      context,
      request.otherListTotal,
    );
    return {
      quote: this.toProductQuote(explanation.quote),
      notApplied: explanation.notApplied,
    };
  }

  /** Engine quote of product lines in Decimal money, as stored and returned. */
  toProductQuote(quote: ProductsQuote): ProductPriceQuote {
    return {
      lines: quote.lines.map((line) => this.toProductLinePrice(line)),
      listTotal: MoneyUtils.fromMinor(quote.listTotal),
      discountTotal: MoneyUtils.fromMinor(quote.discountTotal),
      total: MoneyUtils.fromMinor(quote.total),
      promoCode: quote.promoCode,
    };
  }

  /**
   * Prices of the location indexed for many lookups in one request: ranking "any staff"
   * candidates, slot prices, staff prices in the booking catalog. Money in minor units.
   */
  async priceBook(
    locationId: string,
    consistency: ReadConsistency,
  ): Promise<PriceBook> {
    const snapshot = await this.snapshots.load(locationId, consistency);
    return new PriceBook(
      snapshot,
      TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
    );
  }

  /** Lines must be priced services; bundle lines are exactly the bundle items. */
  assertPriceable(
    book: PriceBook,
    bundleId: string | null,
    serviceIds: readonly string[],
  ): void {
    const problem = this.unpriceable(book, bundleId, serviceIds);
    if (problem) throw new AppException(problem.code, problem.status);
  }

  /**
   * Whether the lines can be priced now (see assertPriceable). A stored booking may not:
   * its service was deactivated or its bundle edited since it was made.
   */
  canPrice(
    book: PriceBook,
    bundleId: string | null,
    serviceIds: readonly string[],
  ): boolean {
    return this.unpriceable(book, bundleId, serviceIds) === null;
  }

  private unpriceable(
    book: PriceBook,
    bundleId: string | null,
    serviceIds: readonly string[],
  ): UnpriceableLines | null {
    if (serviceIds.some((serviceId) => !book.hasService(serviceId)))
      return {
        code: ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      };
    if (bundleId === null) return null;
    const bundle = book.bundle(bundleId);
    if (!bundle)
      return {
        code: ErrorCode.BOOKING_BUNDLE_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      };
    // Bundle lines are the bundle items, each service once. The caller read the bundle
    // separately: if its services differ, the bundle was edited in between.
    const bundleServiceIds = new Set(bundle.serviceIds);
    if (
      serviceIds.length !== bundleServiceIds.size ||
      new Set(serviceIds).size !== bundleServiceIds.size ||
      serviceIds.some((serviceId) => !bundleServiceIds.has(serviceId))
    )
      return {
        code: ErrorCode.BOOKING_BUNDLE_CHANGED,
        status: HttpStatus.CONFLICT,
      };
    if (
      bundle.pricingMode === BundlePricingMode.FIXED &&
      bundle.fixedPrice === null
    )
      return {
        code: ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED,
        status: HttpStatus.BAD_REQUEST,
      };
    return null;
  }

  /** Engine quote in Decimal money, as stored and returned. */
  toQuote(quote: VisitQuote): ServicePriceQuote {
    return {
      lines: quote.lines.map((line) => this.toLinePrice(line)),
      listTotal: MoneyUtils.fromMinor(quote.listTotal),
      discountTotal: MoneyUtils.fromMinor(quote.discountTotal),
      total: MoneyUtils.fromMinor(quote.total),
      promoCode: quote.promoCode,
    };
  }

  private productEngineRequest(
    book: PriceBook,
    request: ProductPriceRequest,
  ): ProductQuoteRequest {
    for (const line of request.lines)
      if (!book.hasProduct(line.productLocationId))
        throw new AppException(
          ErrorCode.ORDER_PRODUCT_NOT_SELLABLE,
          HttpStatus.CONFLICT,
        );
    return {
      lines: request.lines.map((line) => ({
        productLocationId: line.productLocationId,
        quantityMilli: this.quantityMilli(line.quantity),
        customUnitPrice:
          line.customUnitPrice === null
            ? null
            : MoneyUtils.toMinor(line.customUnitPrice),
        sellerStaffId: line.sellerStaffId,
      })),
      time: request.time,
      context: request.context,
      otherListTotal: MoneyUtils.toMinor(request.otherListTotal),
    };
  }

  private quantityMilli(quantity: Prisma.Decimal): number {
    if (quantity.decimalPlaces() > QUANTITY_SCALE || quantity.isNegative())
      throw new RangeError(`Invalid quantity ${quantity.toString()}`);
    const milli = quantity.mul(10 ** QUANTITY_SCALE).toNumber();
    if (!Number.isSafeInteger(milli))
      throw new RangeError(`Quantity ${quantity.toString()} is out of range`);
    return milli;
  }

  private assertProductChoices(
    quote: ProductsQuote,
    context: QuoteContext,
  ): void {
    for (const [key, choice] of Object.entries(context.choice ?? {})) {
      const lineIndex = Number(key);
      const line = quote.lines[lineIndex];
      if (!line || line.customUnitPrice !== null || choice.fallbackToAuto)
        continue;
      if (
        choice.mode !== DiscountChoiceMode.RULE &&
        choice.mode !== DiscountChoiceMode.CLIENT_DISCOUNT
      )
        continue;
      if (line.eligible.some((candidate) => this.wanted(choice, candidate)))
        continue;
      const payload: PromotionNotApplicable = {
        lineIndex,
        ruleId: choice.ruleId ?? null,
        reason:
          line.ineligible.find((skip) => skip.ruleId === choice.ruleId)
            ?.reason ?? PriceRuleSkipReason.NOT_TARGETED,
        productId: line.productId,
      };
      throw new AppException(
        ErrorCode.PROMOTION_NOT_APPLICABLE,
        HttpStatus.CONFLICT,
        payload,
      );
    }
  }

  private wanted(
    choice: { mode: DiscountChoiceMode; ruleId?: string | null },
    adjustment: { kind: string; ruleId: string | null },
  ): boolean {
    return choice.mode === DiscountChoiceMode.RULE
      ? adjustment.kind === PriceAdjustmentKind.PROMOTION &&
          adjustment.ruleId === choice.ruleId
      : adjustment.kind === PriceAdjustmentKind.CLIENT_DISCOUNT;
  }

  private toProductLinePrice(line: ProductLineQuote): ProductLinePrice {
    const adjustments = line.adjustments.map((adjustment, sortOrder) =>
      this.toAdjustment(adjustment, sortOrder),
    );
    const listUnitPrice = MoneyUtils.fromMinor(line.listUnitPrice);
    const customUnitPrice =
      line.customUnitPrice === null
        ? null
        : MoneyUtils.fromMinor(line.customUnitPrice);
    return {
      productLocationId: line.productLocationId,
      productId: line.productId,
      baseUnitPrice: MoneyUtils.fromMinor(line.baseUnitPrice),
      listUnitPrice,
      listLineTotal: MoneyUtils.fromMinor(line.listLineTotal),
      customUnitPrice,
      unitPrice: customUnitPrice ?? listUnitPrice,
      lineSubtotal: MoneyUtils.fromMinor(line.lineSubtotal),
      discountTotal: MoneyUtils.fromMinor(line.discountTotal),
      lineTotal: MoneyUtils.fromMinor(line.lineTotal),
      adjustments,
      discount: line.discount === null ? null : adjustments[0],
      eligible: line.eligible.map((candidate) => this.toOption(candidate)),
      ineligible: line.ineligible,
    };
  }

  private assertChoices(quote: VisitQuote, context: QuoteContext): void {
    for (const [key, choice] of Object.entries(context.choice ?? {})) {
      const lineIndex = Number(key);
      const line = quote.lines[lineIndex];
      if (!line || line.customPrice !== null || choice.fallbackToAuto)
        continue;
      if (
        choice.mode !== DiscountChoiceMode.RULE &&
        choice.mode !== DiscountChoiceMode.CLIENT_DISCOUNT
      )
        continue;
      if (line.eligible.some((candidate) => this.wanted(choice, candidate)))
        continue;
      const payload: PromotionNotApplicable = {
        lineIndex,
        ruleId: choice.ruleId ?? null,
        reason:
          line.ineligible.find((skip) => skip.ruleId === choice.ruleId)
            ?.reason ?? PriceRuleSkipReason.NOT_TARGETED,
      };
      throw new AppException(
        ErrorCode.PROMOTION_NOT_APPLICABLE,
        HttpStatus.CONFLICT,
        payload,
      );
    }
  }

  private toLinePrice(line: LineQuote): ServiceLinePrice {
    const adjustments = line.adjustments.map((adjustment, sortOrder) =>
      this.toAdjustment(adjustment, sortOrder),
    );
    return {
      serviceId: line.serviceId,
      basePrice: MoneyUtils.fromMinor(line.basePrice),
      staffPrice: MoneyUtils.fromMinor(line.staffPrice),
      listPrice: MoneyUtils.fromMinor(line.listPrice),
      discountTotal: MoneyUtils.fromMinor(line.discountTotal),
      chargedPrice: MoneyUtils.fromMinor(line.chargedPrice),
      customPrice:
        line.customPrice === null
          ? null
          : MoneyUtils.fromMinor(line.customPrice),
      adjustments,
      discount: line.discount === null ? null : adjustments[adjustments.length - 1],
      eligible: line.eligible.map((candidate) => this.toOption(candidate)),
      ineligible: line.ineligible,
    };
  }

  private toOption(candidate: DiscountCandidate): ServiceDiscountOption {
    return {
      kind: candidate.kind as PrismaPriceAdjustmentKind,
      ruleId: candidate.ruleId,
      title: candidate.title,
      publicTitle: candidate.publicTitle,
      valueType: candidate.valueType as PrismaPriceValueType,
      value: MoneyUtils.fromMinor(candidate.value),
      amount: MoneyUtils.fromMinor(candidate.amount),
      chargedPrice: MoneyUtils.fromMinor(candidate.chargedPrice),
    };
  }

  private toAdjustment(
    adjustment: PriceAdjustment,
    sortOrder: number,
  ): ServicePriceAdjustment {
    return {
      sortOrder,
      kind: adjustment.kind as PrismaPriceAdjustmentKind,
      ruleId: adjustment.ruleId,
      title: adjustment.title,
      publicTitle: adjustment.publicTitle,
      valueType: adjustment.valueType as PrismaPriceValueType | null,
      value:
        adjustment.value === null
          ? null
          : MoneyUtils.fromMinor(adjustment.value),
      amount: MoneyUtils.fromMinor(adjustment.amount),
    };
  }
}
