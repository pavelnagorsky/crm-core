import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole, Prisma } from '@prisma/client';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceCheckController } from './price-check.controller.js';
import { PriceLevelTablesController } from './price-level-tables.controller.js';
import { PriceRulesController } from './price-rules.controller.js';
import { PricingPreviewController } from './pricing-preview.controller.js';

const allowed = (
  controller: new (...args: never[]) => object,
  handler: string,
  role: BusinessRole,
): boolean => {
  const context = {
    getHandler: () =>
      (controller.prototype as Record<string, () => unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: tokenPayload(role),
        params: { locationId: 'location-1' },
      }),
    }),
  } as unknown as ExecutionContext;
  try {
    return new PermissionGuard(new Reflector()).canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
};

describe('Pricing cabinet controllers', () => {
  const rulePreview = { preview: vi.fn() };
  const roundingPreview = { preview: vi.fn() };
  const matrix = { matrix: vi.fn(), personalPrices: vi.fn() };
  const fill = { preview: vi.fn(), apply: vi.fn() };
  const explain = { explain: vi.fn() };
  const weekMap = { weekMap: vi.fn() };
  const token = tokenPayload(BusinessRole.OWNER);
  const previews = () => new PricingPreviewController(roundingPreview as never);
  const bookings = {
    getPromotionMatchItems: vi.fn(),
    getPromotionReport: vi.fn(),
  };
  const ruleService = { get: vi.fn() };
  const productStats = { saleLines: vi.fn(), fullReport: vi.fn() };
  const inventory = { lastPurchaseUnitCosts: vi.fn() };
  const ruleControllers = () =>
    new PriceRulesController(
      ruleService as never,
      rulePreview as never,
      {} as never,
      bookings as never,
      productStats as never,
      inventory as never,
    );
  const checks = () =>
    new PriceCheckController(explain as never, weekMap as never);

  beforeEach(() => vi.resetAllMocks());

  it('maps the rule preview to the contract', async () => {
    rulePreview.preview.mockResolvedValue({
      status: PriceRuleStatus.ACTIVE,
      nextDate: '2026-12-04',
      examples: [
        {
          serviceId: 's',
          serviceTitle: 'Cut',
          levelName: null,
          before: 6000,
          raw: 6750,
          after: 6800,
          amount: 800,
        },
      ],
      replaces: [
        {
          ruleId: 'r',
          name: 'Evening',
          scheduleType: 'WEEKLY',
          valueType: 'PERCENT',
          value: new Prisma.Decimal('20'),
        },
      ],
      conflicts: [{ ruleId: 'c', ruleName: 'Other', date: '2027-03-08' }],
      conditions: [],
      serviceCount: 1,
      totalServiceCount: 3,
      productCount: 0,
      totalProductCount: 4,
      productExamples: [],
      belowCostCount: 0,
      overlaps: [],
      matches30d: null,
    });
    const result = await ruleControllers().previewRule(
      'location-1',
      {} as never,
      token,
    );
    expect(result.responseValue).toEqual({
      status: 'ACTIVE',
      nextDate: '2026-12-04',
      examples: [
        {
          serviceId: 's',
          serviceTitle: 'Cut',
          levelName: null,
          before: '60.00',
          raw: '67.50',
          after: '68.00',
          amount: '8.00',
        },
      ],
      replaces: [
        {
          ruleId: 'r',
          name: 'Evening',
          scheduleType: 'WEEKLY',
          valueType: 'PERCENT',
          value: '20.00',
        },
      ],
      conflicts: [{ ruleId: 'c', name: 'Other', date: '2027-03-08' }],
      conditions: [],
      serviceCount: 1,
      totalServiceCount: 3,
      productCount: 0,
      totalProductCount: 4,
      productExamples: [],
      belowCostCount: 0,
      overlaps: [],
      matches30d: null,
    });
  });

  it('maps product examples and matches of a promotion preview; the sources read sales and costs', async () => {
    rulePreview.preview.mockResolvedValue({
      status: PriceRuleStatus.ACTIVE,
      nextDate: '2026-12-04',
      examples: [],
      replaces: [],
      conflicts: [],
      conditions: ['−10% на все товары'],
      serviceCount: 0,
      totalServiceCount: 3,
      productCount: 2,
      totalProductCount: 2,
      productExamples: [
        {
          productId: 'p1',
          productName: 'Шампунь',
          unit: 'PIECE',
          before: new Prisma.Decimal('20'),
          after: new Prisma.Decimal('18'),
          amount: new Prisma.Decimal('2'),
          lastPurchaseUnitCost: new Prisma.Decimal('19.5'),
          belowCost: true,
        },
      ],
      belowCostCount: 1,
      overlaps: [],
      matches30d: {
        bookingsCount: 0,
        salesCount: 2,
        discount: new Prisma.Decimal('4'),
      },
    });
    const result = await ruleControllers().previewRule(
      'location-1',
      {} as never,
      token,
    );
    expect(result.responseValue?.productExamples).toEqual([
      {
        productId: 'p1',
        productName: 'Шампунь',
        unit: 'PIECE',
        before: '20.00',
        after: '18.00',
        amount: '2.00',
        lastPurchaseUnitCost: '19.50000000',
        belowCost: true,
      },
    ]);
    expect(result.responseValue?.belowCostCount).toBe(1);
    expect(result.responseValue?.matches30d).toEqual({
      bookingsCount: 0,
      salesCount: 2,
      discount: '4.00',
    });
    const sources = rulePreview.preview.mock.calls[0][3];
    expect(sources.canReadPurchaseCost).toBe(true);
    const from = new Date('2026-11-01');
    const to = new Date('2026-12-01');
    await sources.loadSaleLines(from, to);
    expect(productStats.saleLines).toHaveBeenCalledWith('location-1', from, to);
    await sources.loadPurchaseCosts(['pl-1']);
    expect(inventory.lastPurchaseUnitCosts).toHaveBeenCalledWith(
      'location-1',
      ['pl-1'],
    );
  });

  it('builds the promotion report from the visits and the product lines', async () => {
    ruleService.get.mockResolvedValue({});
    const visits = { revenue: new Prisma.Decimal('100') };
    bookings.getPromotionReport.mockResolvedValue(visits);
    productStats.fullReport.mockResolvedValue({
      revenue: new Prisma.Decimal('130'),
      servicesRevenue: new Prisma.Decimal('100'),
      productsRevenue: new Prisma.Decimal('30'),
      productsDiscount: new Prisma.Decimal('3.33'),
      productsReturned: new Prisma.Decimal('10'),
      salesCount: 1,
      products: [
        {
          productId: 'p1',
          title: 'Шампунь',
          quantity: new Prisma.Decimal('2'),
          revenue: new Prisma.Decimal('30'),
          discount: new Prisma.Decimal('3.33'),
        },
      ],
      discount: new Prisma.Decimal('13.33'),
      bookingsCount: 1,
      clientsCount: 2,
      newClients: 1,
      returningClients: 1,
      avgDiscount: new Prisma.Decimal('10'),
      returnedRate: null,
      staff: [
        {
          staffId: 's1',
          name: 'Anna',
          avatarUrl: null,
          bookingsCount: 0,
          revenue: new Prisma.Decimal('0'),
          discount: new Prisma.Decimal('0'),
          productsRevenue: new Prisma.Decimal('30'),
        },
      ],
      notReturned: { count: 0, items: [] },
    });
    const result = (
      await ruleControllers().report('location-1', 'rule-1', {})
    ).responseValue;
    expect(productStats.fullReport).toHaveBeenCalledWith(
      'location-1',
      'rule-1',
      expect.any(Date),
      expect.any(Date),
      visits,
    );
    expect(result).toMatchObject({
      revenue: '130.00',
      servicesRevenue: '100.00',
      productsRevenue: '30.00',
      productsDiscount: '3.33',
      productsReturned: '10.00',
      salesCount: 1,
      products: [
        {
          productId: 'p1',
          title: 'Шампунь',
          quantity: '2.000',
          revenue: '30.00',
          discount: '3.33',
        },
      ],
      discount: '13.33',
      staff: [
        {
          staffId: 's1',
          bookingsCount: 0,
          revenue: '0.00',
          productsRevenue: '30.00',
        },
      ],
    });
  });

  it('maps the rounding preview', async () => {
    roundingPreview.preview.mockResolvedValue([
      {
        serviceTitle: 'Cut',
        basePrice: 6000,
        label: 'наценка +15%',
        raw: 6900,
        rounded: 7000,
        largeStep: false,
      },
    ]);
    const result = await previews().previewRounding('location-1', {
      priceRoundingStep: '5.00',
    });
    expect(roundingPreview.preview).toHaveBeenCalledWith('location-1', '5.00');
    expect(result.responseValue?.examples[0]).toEqual({
      serviceTitle: 'Cut',
      basePrice: '60.00',
      label: 'наценка +15%',
      raw: '69.00',
      rounded: '70.00',
      largeStep: false,
    });
  });

  it('maps the explanation with signed adjustments and HH:mm intervals', async () => {
    explain.explain.mockResolvedValue({
      kind: 'SERVICE',
      lastPurchaseUnitCost: null,
      belowCost: false,
      staffId: 'a',
      staffName: 'Anna',
      levelName: 'Top',
      total: 6600,
      line: {
        basePrice: 6000,
        staffPrice: 6000,
        adjustments: [
          {
            kind: 'SURCHARGE',
            ruleId: 'r',
            title: 'Evening',
            publicTitle: null,
            valueType: 'PERCENT',
            value: 1000,
            amount: 600,
          },
          {
            kind: 'STAFF',
            ruleId: null,
            title: 'Anna',
            publicTitle: null,
            valueType: null,
            value: null,
            amount: -100,
          },
        ],
        listPrice: 6600,
        discount: null,
        chargedPrice: 6600,
        total: 6600,
      },
      promoCode: null,
      candidates: [
        {
          staffId: 'a',
          name: 'Anna',
          levelName: 'Top',
          personal: false,
          price: 6600,
          available: true,
        },
      ],
      notApplied: [
        {
          ruleId: 'm',
          name: 'Morning',
          reason: 'OUT_OF_INTERVAL',
          intervals: [{ start: 480, end: 1440 }],
        },
      ],
    });
    const result = (await checks().explain('location-1', {} as never, token))
      .responseValue;
    expect(explain.explain).toHaveBeenCalledWith('location-1', {}, true);
    expect(result?.kind).toBe('SERVICE');
    expect(result?.lastPurchaseUnitCost).toBeNull();
    expect(result?.total).toBe('66.00');
    expect(result?.line.adjustments).toEqual([
      {
        kind: 'SURCHARGE',
        ruleId: 'r',
        title: 'Evening',
        valueType: 'PERCENT',
        value: '10.00',
        amount: '6.00',
      },
      {
        kind: 'STAFF',
        ruleId: null,
        title: 'Anna',
        valueType: null,
        value: null,
        amount: '-1.00',
      },
    ]);
    expect(result?.notApplied[0].intervals).toEqual([
      { start: '08:00', end: '24:00' },
    ]);
    expect(result?.candidates[0].price).toBe('66.00');
  });

  it('maps the week map to HH:mm segments', async () => {
    weekMap.weekMap.mockResolvedValue({
      hours: { from: 9, to: 21 },
      days: [
        {
          date: '2026-12-04',
          segments: [
            {
              start: 0,
              end: 1440,
              price: 6000,
              staffPrice: 6000,
              adjustments: [{ ruleId: null, title: 'Округление', amount: -50 }],
            },
          ],
        },
      ],
    });
    const result = await checks().weekMap('location-1', {} as never);
    expect(result.responseValue).toEqual({
      hours: { from: 9, to: 21 },
      days: [
        {
          date: '2026-12-04',
          segments: [
            {
              start: '00:00',
              end: '24:00',
              price: '60.00',
              staffPrice: '60.00',
              adjustments: [
                { ruleId: null, title: 'Округление', amount: '-0.50' },
              ],
            },
          ],
        },
      ],
    });
  });

  it('maps the matrix, personal prices and the fill', async () => {
    matrix.matrix.mockResolvedValue({
      levels: [
        { id: 'top', name: 'Top', sortOrder: 1, isDefault: false, staffCount: 2 },
      ],
      categories: [
        {
          id: null,
          name: 'Без категории',
          services: [
            {
              serviceId: 's',
              title: 'Cut',
              basePrice: new Prisma.Decimal('60'),
              prices: [{ levelId: 'top', price: null }],
            },
          ],
        },
      ],
    });
    matrix.personalPrices.mockResolvedValue([
      {
        staffId: 'a',
        staffName: 'Anna',
        avatarUrl: null,
        levelName: 'Top',
        serviceId: 's',
        serviceTitle: 'Cut',
        levelPrice: new Prisma.Decimal('80'),
        price: new Prisma.Decimal('75'),
      },
    ]);
    fill.apply.mockResolvedValue(3);
    const controller = new PriceLevelTablesController(
      matrix as never,
      fill as never,
    );
    const result = (await controller.getMatrix('location-1')).responseValue;
    expect(result?.categories[0].services[0]).toEqual({
      serviceId: 's',
      title: 'Cut',
      basePrice: '60.00',
      prices: [{ levelId: 'top', price: null }],
    });
    expect(
      (await controller.getPersonalPrices('location-1')).responseValue,
    ).toEqual([
      {
        staffId: 'a',
        staffName: 'Anna',
        avatarUrl: null,
        levelName: 'Top',
        serviceId: 's',
        serviceTitle: 'Cut',
        levelPrice: '80.00',
        price: '75.00',
      },
    ]);
    const applied = await controller.applyFill(
      'location-1',
      'top',
      {
        categoryIds: [],
        mode: PriceLevelFillMode.PERCENT,
        value: '10.00',
        priceRoundingStep: '1.00',
        serviceIds: ['s'],
      },
      token,
    );
    expect(applied.responseValue).toEqual({ updated: 3 });
  });

  describe('permissions', () => {
    const endpoints: [new (...args: never[]) => object, string][] = [
      [PriceRulesController, 'previewRule'],
      [PricingPreviewController, 'previewRounding'],
      [PriceCheckController, 'explain'],
      [PriceCheckController, 'weekMap'],
      [PriceLevelTablesController, 'getMatrix'],
      [PriceLevelTablesController, 'getPersonalPrices'],
      [PriceLevelTablesController, 'previewFill'],
      [PriceLevelTablesController, 'applyFill'],
    ];
    it.each(endpoints)(
      '%s.%s is open to the owner and the manager, closed to staff',
      (controller, handler) => {
        expect(allowed(controller, handler, BusinessRole.OWNER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.MANAGER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.STAFF)).toBe(false);
      },
    );
  });
});
