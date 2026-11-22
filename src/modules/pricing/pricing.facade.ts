import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PriceAdjustmentKind as PrismaPriceAdjustmentKind,
  PriceValueType as PrismaPriceValueType,
} from '@prisma/client';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../shared/money/money.utils.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { ServicePriceCalculator } from './engine/calculators/service-price.calculator.js';
import { BundlePricingMode } from './engine/enums/bundle-pricing-mode.enum.js';
import { LineQuote } from './engine/interfaces/line-quote.interface.js';
import { PricingSnapshot } from './engine/interfaces/pricing-snapshot.interface.js';
import { ServiceLinePrice } from './interfaces/service-line-price.interface.js';
import { ServicePriceQuote } from './interfaces/service-price-quote.interface.js';
import { ServicePriceRequest } from './interfaces/service-price-request.interface.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';

/** Prices and promotions: the one place that computes what a sale line costs. */
@Injectable()
export class PricingFacade {
  constructor(private readonly snapshots: PricingSnapshotService) {}

  /**
   * Price layers of the service lines of one visit. FRESH when the result is stored
   * (booking creation), CACHED when it is only shown.
   */
  async quoteServices(
    locationId: string,
    request: ServicePriceRequest,
    consistency: ReadConsistency,
  ): Promise<ServicePriceQuote> {
    const snapshot = await this.snapshots.load(locationId, consistency);
    this.assertPriceable(snapshot, request);
    const quote = ServicePriceCalculator.quote(snapshot, {
      bundleId: request.bundleId,
      lines: request.lines.map((line) => ({
        serviceId: line.serviceId,
        staffId: line.staffId,
        customPrice:
          line.customPrice === null
            ? null
            : MoneyUtils.toMinor(line.customPrice),
      })),
    });
    return { lines: quote.lines.map((line) => this.toLinePrice(line)) };
  }

  private assertPriceable(
    snapshot: PricingSnapshot,
    request: ServicePriceRequest,
  ): void {
    const serviceIds = new Set(snapshot.services.map(({ id }) => id));
    if (request.lines.some((line) => !serviceIds.has(line.serviceId)))
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (request.bundleId === null) return;
    const bundle = snapshot.bundles.find(({ id }) => id === request.bundleId);
    if (!bundle)
      throw new AppException(
        ErrorCode.BOOKING_BUNDLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    // Bundle lines are the bundle items, each service once. The caller read the bundle
    // separately: if its services differ, the bundle was edited in between.
    const bundleServiceIds = new Set(bundle.serviceIds);
    if (
      request.lines.length !== bundleServiceIds.size ||
      new Set(request.lines.map((line) => line.serviceId)).size !==
        bundleServiceIds.size ||
      request.lines.some((line) => !bundleServiceIds.has(line.serviceId))
    )
      throw new AppException(
        ErrorCode.BOOKING_BUNDLE_CHANGED,
        HttpStatus.CONFLICT,
      );
    if (
      bundle.pricingMode === BundlePricingMode.FIXED &&
      bundle.fixedPrice === null
    )
      throw new AppException(
        ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
  }

  private toLinePrice(line: LineQuote): ServiceLinePrice {
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
      adjustments: line.adjustments.map((adjustment, sortOrder) => ({
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
      })),
    };
  }
}
