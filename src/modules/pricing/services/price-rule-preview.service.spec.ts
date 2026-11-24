import { HttpStatus } from '@nestjs/common';
import {
  PriceRuleKind,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  Prisma,
  PromotionChannel,
  PromotionClientFilter,
} from '@prisma/client';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { PriceRulePreviewRequestDto } from '../dto/price-rule-preview-request.dto.js';
import {
  pricingSnapshot,
  priceLevel,
} from '../engine/testing/pricing-snapshot.factory.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import { PriceRulePreviewService } from './price-rule-preview.service.js';

// Monday 23 November 2026, UTC location.
const NOW = new Date('2026-11-23T10:00:00.000Z');

const input = (over: Partial<PriceRuleInputDto> = {}): PriceRuleInputDto => ({
  scheduleType: PriceScheduleType.WEEKLY,
  name: 'Evening',
  valueType: PriceValueType.PERCENT,
  value: '10.00',
  weekdays: [5],
  intervals: [{ start: '17:00', end: '21:00' }],
  appliesToAll: true,
  ...over,
});

const holidayInput = (over: Partial<PriceRuleInputDto> = {}) =>
  input({
    scheduleType: PriceScheduleType.HOLIDAYS,
    name: 'March 8',
    weekdays: undefined,
    intervals: undefined,
    dates: ['2027-03-08'],
    holidayExclusive: true,
    ...over,
  });

const request = (
  rule: PriceRuleInputDto,
  ruleId?: string,
): PriceRulePreviewRequestDto => ({ rule, ruleId });

describe('PriceRulePreviewService', () => {
  const reads = { findRule: vi.fn(), listForSnapshot: vi.fn() };
  const ruleCatalog = {
    assertTargetsInLocation: vi.fn(),
    loadCoverage: vi.fn(),
    nameTargets: vi.fn(),
  };
  const snapshots = { load: vi.fn() };
  const serviceCatalog = { loadCatalogSnapshot: vi.fn() };
  const locations = { getBookingSettings: vi.fn() };
  const staff = { namesByIds: vi.fn() };
  const service = new PriceRulePreviewService(
    reads as never,
    ruleCatalog as never,
    snapshots as never,
    serviceCatalog as never,
    locations as never,
    staff as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    snapshots.load.mockResolvedValue(
      pricingSnapshot({
        services: { cut: 6000, color: 9000, wash: 1500 },
        levels: [priceLevel('std', 'Standard', true), priceLevel('top', 'Top')],
        levelPrices: { cut: { top: 8000 } },
        roundingStep: 100,
      }),
    );
    serviceCatalog.loadCatalogSnapshot.mockResolvedValue({
      services: [
        { id: 'cut', title: 'Haircut', status: 'ACTIVE' },
        { id: 'color', title: 'Color', status: 'ACTIVE' },
        { id: 'wash', title: 'Wash', status: 'ACTIVE' },
      ],
    });
    locations.getBookingSettings.mockResolvedValue({ timezone: 'UTC' });
    reads.listForSnapshot.mockResolvedValue([]);
    ruleCatalog.loadCoverage.mockResolvedValue({
      services: [
        { id: 'cut', categoryId: null },
        { id: 'color', categoryId: null },
        { id: 'wash', categoryId: null },
      ],
      bundles: [],
    });
    ruleCatalog.nameTargets.mockResolvedValue([]);
    staff.namesByIds.mockResolvedValue(new Map());
  });

  it('prices the base level and one other level at the first interval start', async () => {
    const preview = await service.preview('location', request(input()), NOW);
    expect(preview.status).toBe(PriceRuleStatus.ACTIVE);
    // Friday 27 November: the first date the rule works.
    expect(preview.nextDate).toBe('2026-11-27');
    expect(preview.examples).toEqual([
      {
        serviceId: 'cut',
        serviceTitle: 'Haircut',
        levelName: 'Standard',
        before: 6000,
        raw: 6600,
        after: 6600,
        amount: 600,
      },
      {
        serviceId: 'cut',
        serviceTitle: 'Haircut',
        levelName: 'Top',
        before: 8000,
        raw: 8800,
        after: 8800,
        amount: 800,
      },
      {
        serviceId: 'color',
        serviceTitle: 'Color',
        levelName: 'Standard',
        before: 9000,
        raw: 9900,
        after: 9900,
        amount: 900,
      },
    ]);
    expect(preview.replaces).toEqual([]);
    expect(preview.conflicts).toEqual([]);
  });

  it('shows the raw price before the rounding to the location step', async () => {
    const preview = await service.preview(
      'location',
      request(input({ value: '12.50' })),
      NOW,
    );
    // 60.00 + 12.5% = 67.50, rounded to 68.00.
    expect(preview.examples[0]).toMatchObject({
      before: 6000,
      raw: 6750,
      after: 6800,
    });
  });

  it('takes a rule without intervals at noon, and lists only the services it reaches', async () => {
    const preview = await service.preview(
      'location',
      request(
        input({
          intervals: undefined,
          appliesToAll: false,
          targets: [{ type: PriceRuleTargetType.SERVICE, id: 'wash' }],
        }),
      ),
      NOW,
    );
    expect(preview.examples).toEqual([
      {
        serviceId: 'wash',
        serviceTitle: 'Wash',
        levelName: 'Standard',
        before: 1500,
        raw: 1650,
        after: 1700,
        amount: 200,
      },
    ]);
  });

  it('replaces the rule being edited instead of stacking on it', async () => {
    const existing = priceRuleRecord({
      id: 'rule-1',
      value: '50.00',
      weekdaysMask: 1 << 4,
    });
    reads.findRule.mockResolvedValue(existing);
    reads.listForSnapshot.mockResolvedValue([existing]);
    const preview = await service.preview(
      'location',
      request(input(), 'rule-1'),
      NOW,
    );
    expect(preview.examples[0]).toMatchObject({ before: 6000, raw: 6600 });
  });

  it('stacks on the other rules of the location', async () => {
    reads.listForSnapshot.mockResolvedValue([
      priceRuleRecord({ id: 'other', value: '20.00', weekdaysMask: 1 << 4 }),
    ]);
    const preview = await service.preview('location', request(input()), NOW);
    expect(preview.examples[0]).toMatchObject({ before: 6000, raw: 7800 });
  });

  it('previews a disabled rule as disabled but still shows its effect', async () => {
    const preview = await service.preview(
      'location',
      request(input({ enabled: false })),
      NOW,
    );
    expect(preview.status).toBe(PriceRuleStatus.DISABLED);
    expect(preview.examples[0].raw).toBe(6600);
  });

  it('has no next date or examples for a period in the past', async () => {
    const preview = await service.preview(
      'location',
      request(input({ visitFrom: '2026-01-01', visitTo: '2026-02-01' })),
      NOW,
    );
    expect(preview.status).toBe(PriceRuleStatus.ENDED);
    expect(preview.nextDate).toBeNull();
    expect(preview.examples).toEqual([]);
  });

  describe('exclusive holiday', () => {
    const weekly = priceRuleRecord({ id: 'weekly', name: 'Every day +20%' });
    const sameDate = priceRuleRecord({
      id: 'march8',
      name: 'Other March 8',
      scheduleType: PriceScheduleType.HOLIDAYS,
      holidayExclusive: true,
      dates: ['2027-03-08'],
    });

    it('lists the surcharges it replaces and the holiday rules it collides with', async () => {
      reads.listForSnapshot.mockResolvedValue([weekly, sameDate]);
      const preview = await service.preview(
        'location',
        request(holidayInput()),
        NOW,
      );
      expect(preview.replaces.map((rule) => rule.ruleId)).toEqual(['weekly']);
      expect(preview.conflicts).toEqual([
        { ruleId: 'march8', ruleName: 'Other March 8', date: '2027-03-08' },
      ]);
    });

    it('does not list surcharges that do not work on its dates or reach its services', async () => {
      reads.listForSnapshot.mockResolvedValue([
        // Tuesdays only: 8 March 2027 is a Monday.
        priceRuleRecord({ id: 'tuesday', weekdaysMask: 1 << 1 }),
        priceRuleRecord({
          id: 'other-service',
          appliesToAll: false,
          targets: [[PriceRuleTargetType.SERVICE, 'color']],
        }),
        priceRuleRecord({ id: 'off', enabled: false }),
      ]);
      const preview = await service.preview(
        'location',
        request(
          holidayInput({
            appliesToAll: false,
            targets: [{ type: PriceRuleTargetType.SERVICE, id: 'cut' }],
          }),
        ),
        NOW,
      );
      expect(preview.replaces).toEqual([]);
    });

    it('reports no conflicts when the rule is not exclusive or is switched off', async () => {
      reads.listForSnapshot.mockResolvedValue([sameDate]);
      const plain = await service.preview(
        'location',
        request(holidayInput({ holidayExclusive: false })),
        NOW,
      );
      const off = await service.preview(
        'location',
        request(holidayInput({ enabled: false })),
        NOW,
      );
      expect(plain.conflicts).toEqual([]);
      expect(off.conflicts).toEqual([]);
    });
  });

  it('validates like a save', async () => {
    const error = await service
      .preview('location', request(input({ value: '0.00' })), NOW)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      errorCode: 'PRICE_RULE_INVALID',
      payload: { field: 'value' },
    });
  });

  it('refuses to preview an archived rule like an update does', async () => {
    reads.findRule.mockResolvedValue(
      priceRuleRecord({ id: 'rule-1', archivedAt: new Date(0) }),
    );
    const error = await service
      .preview('location', request(input(), 'rule-1'), NOW)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      errorCode: 'PRICE_RULE_ARCHIVED',
      status: HttpStatus.CONFLICT,
    });
  });

  describe('promotions', () => {
    const promo = (over: Partial<PriceRuleInputDto> = {}): PriceRuleInputDto =>
      input({
        kind: PriceRuleKind.PROMOTION,
        name: 'Morning',
        value: '15.00',
        weekdays: [1],
        intervals: [{ start: '10:00', end: '12:00' }],
        publicName: 'Утро',
        channels: [PromotionChannel.ONLINE],
        clientFilter: PromotionClientFilter.NEW,
        minVisitTotal: '500.00',
        ...over,
      });

    beforeEach(() => {
      locations.getBookingSettings.mockResolvedValue({
        timezone: 'UTC',
        currency: 'BYN',
      });
      serviceCatalog.loadCatalogSnapshot.mockResolvedValue({
        services: [
          { id: 'cut', title: 'Haircut', status: 'ACTIVE', categoryId: null },
          { id: 'color', title: 'Color', status: 'ACTIVE', categoryId: null },
          { id: 'wash', title: 'Wash', status: 'ACTIVE', categoryId: null },
        ],
        bundles: [],
      });
    });

    it('shows the discount itself, conditions, coverage and past matches', async () => {
      const loader = vi.fn().mockResolvedValue([
        {
          bookingId: 'b1',
          serviceId: 'cut',
          staffId: 'anna',
          bundleId: null,
          visitStartAt: new Date('2026-11-16T10:30:00.000Z'),
          channel: 'WIDGET',
          listPrice: new Prisma.Decimal('60.00'),
        },
      ]);
      const preview = await service.preview(
        'location',
        request(promo()),
        NOW,
        loader,
      );
      expect(preview.nextDate).toBe('2026-11-23');
      // Client and total conditions are left out of the example: 60.00 - 15% = 51.00.
      expect(preview.examples[0]).toEqual({
        serviceId: 'cut',
        serviceTitle: 'Haircut',
        levelName: 'Standard',
        before: 6000,
        raw: 5100,
        after: 5100,
        amount: 900,
      });
      expect(preview.conditions).toEqual([
        '−15% на все услуги',
        'Пн, начало визита с 10:00 до 12:00',
        'Для новых клиентов',
        'Только онлайн-запись',
        'Визит от 500 BYN',
        'На услугу действует одна скидка, самая выгодная',
      ]);
      expect(preview).toMatchObject({
        serviceCount: 3,
        totalServiceCount: 3,
        replaces: [],
        conflicts: [],
        overlaps: [],
      });
      expect(loader).toHaveBeenCalledWith(
        new Date('2026-10-24T10:00:00.000Z'),
        NOW,
      );
      expect(preview.matches30d?.bookingsCount).toBe(1);
      expect(preview.matches30d?.discount.toFixed(2)).toBe('9.00');
    });

    it('lists an enabled promotion that meets it', async () => {
      reads.listForSnapshot.mockResolvedValue([
        priceRuleRecord({
          id: 'all-day',
          name: 'All day',
          kind: PriceRuleKind.PROMOTION,
          value: '10.00',
        }),
      ]);
      const preview = await service.preview('location', request(promo()), NOW);
      expect(preview.overlaps).toEqual([
        expect.objectContaining({
          ruleId: 'all-day',
          example: 'Все услуги, пн 10:00',
        }),
      ]);
      expect(preview.matches30d).toBeNull();
    });
  });
});
