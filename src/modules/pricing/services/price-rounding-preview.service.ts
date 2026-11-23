import { Injectable } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { RoundingCalculator } from '../engine/calculators/rounding.calculator.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { RoundingMode } from '../engine/enums/rounding-mode.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { RoundingPreviewExample } from '../interfaces/rounding-preview-example.interface.js';
import { nextRuleDate } from '../rules/price-rule-schedule.rules.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

const EXAMPLE_LIMIT = 4;
/** A surcharge shown when no real percent surcharge reaches the service: +15%. */
const SAMPLE_SURCHARGE_BP = 1500;
/** The sample promotion, rounded down like the promotions of stage 4: -15%. */
const SAMPLE_PROMOTION_BP = 1500;
/** Rounding that moves a price by more than this share of it is "large". */
const LARGE_STEP_SHARE_PERCENT = 5;

interface PricedService {
  id: string;
  categoryId: string | null;
  title: string;
  price: number;
}

const percentLabel = (basisPoints: number): string =>
  String(Number((basisPoints / 100).toFixed(2))).replace('.', ',');

/**
 * How a rounding step treats real prices, for the settings screen: up to 4 services with
 * different prices, from cheap to expensive, each with the percent surcharge that reaches it
 * (or a sample +15%), and one row with a sample -15% promotion rounded down. Only reads.
 */
@Injectable()
export class PriceRoundingPreviewService {
  constructor(
    private readonly snapshots: PricingSnapshotService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly locations: LocationService,
  ) {}

  async preview(
    locationId: string,
    priceRoundingStep: string,
    now = new Date(),
  ): Promise<RoundingPreviewExample[]> {
    const step = MoneyUtils.toMinor(priceRoundingStep);
    const [snapshot, catalog, { timezone }] = await Promise.all([
      this.snapshots.load(locationId, ReadConsistency.CACHED),
      this.serviceCatalog.loadCatalogSnapshot(
        locationId,
        ReadConsistency.CACHED,
      ),
      this.locations.getBookingSettings(locationId),
    ]);
    const prices = new Map(
      snapshot.services.map((service) => [service.id, service.price]),
    );
    const services: PricedService[] = catalog.services
      .filter((service) => service.status === ServiceStatus.ACTIVE)
      .flatMap((service) => {
        const price = prices.get(service.id);
        return price === undefined || price <= 0
          ? []
          : [
              {
                id: service.id,
                categoryId: service.categoryId,
                title: service.title,
                price,
              },
            ];
      });
    const spread = this.spread(services);
    if (spread.length === 0) return [];

    const today = TimeUtils.zonedDateStr(now, timezone);
    const rules = snapshot.rules.filter(
      (rule) =>
        rule.enabled &&
        rule.valueType === PriceValueType.PERCENT &&
        nextRuleDate(rule, today) !== null,
    );
    const rows = spread.map((service) =>
      this.surchargeRow(service, rules, step),
    );
    const cheapest = spread[0];
    const raw =
      cheapest.price -
      RoundingCalculator.percent(cheapest.price, SAMPLE_PROMOTION_BP);
    rows.push(
      this.row(
        cheapest,
        `акция −${percentLabel(SAMPLE_PROMOTION_BP)}%`,
        raw,
        RoundingCalculator.round(raw, step, RoundingMode.DOWN),
      ),
    );
    return rows;
  }

  /** Services with distinct prices, up to 4, spread evenly from the cheapest to the dearest. */
  private spread(services: readonly PricedService[]): PricedService[] {
    const distinct = new Map<number, PricedService>();
    for (const service of [...services].sort(
      (a, b) => a.price - b.price || a.title.localeCompare(b.title),
    ))
      if (!distinct.has(service.price)) distinct.set(service.price, service);
    const sorted = [...distinct.values()];
    if (sorted.length <= EXAMPLE_LIMIT) return sorted;
    return Array.from(
      { length: EXAMPLE_LIMIT },
      (_, index) =>
        sorted[
          Math.round((index * (sorted.length - 1)) / (EXAMPLE_LIMIT - 1))
        ],
    );
  }

  private surchargeRow(
    service: PricedService,
    rules: readonly PricingRuleEntry[],
    step: number,
  ): RoundingPreviewExample {
    const rule = rules.find(
      (item) =>
        new CompiledRule(item).targetReason({
          serviceId: service.id,
          categoryId: service.categoryId,
          bundleId: null,
        }) === null,
    );
    const basisPoints = rule?.value ?? SAMPLE_SURCHARGE_BP;
    const raw =
      service.price + RoundingCalculator.percent(service.price, basisPoints);
    return this.row(
      service,
      `наценка +${percentLabel(basisPoints)}%`,
      raw,
      RoundingCalculator.round(raw, step, RoundingMode.NEAREST),
    );
  }

  private row(
    service: PricedService,
    label: string,
    raw: number,
    rounded: number,
  ): RoundingPreviewExample {
    return {
      serviceTitle: service.title,
      basePrice: service.price,
      label,
      raw,
      rounded,
      largeStep:
        Math.abs(rounded - raw) * 100 > raw * LARGE_STEP_SHARE_PERCENT,
    };
  }
}
