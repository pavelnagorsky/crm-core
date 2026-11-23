import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole, Prisma } from '@prisma/client';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceCheckController } from './price-check.controller.js';
import { PriceLevelTablesController } from './price-level-tables.controller.js';
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
  const previews = () =>
    new PricingPreviewController(
      rulePreview as never,
      roundingPreview as never,
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
    });
    const result = await previews().previewRule('location-1', {} as never);
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
        total: 6600,
      },
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
    const result = (await checks().explain('location-1', {} as never))
      .responseValue;
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
      [PricingPreviewController, 'previewRule'],
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
