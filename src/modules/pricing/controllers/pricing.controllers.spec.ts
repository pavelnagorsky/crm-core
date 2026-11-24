import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BusinessRole,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  Prisma,
} from '@prisma/client';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import { PriceLevelsController } from './price-levels.controller.js';
import { PriceRulesController } from './price-rules.controller.js';
import { PricingSettingsController } from './pricing-settings.controller.js';
import { ServicePricesController } from './service-prices.controller.js';

const d = (value: string) => new Prisma.Decimal(value);

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

describe('Pricing controllers', () => {
  const levels = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const prices = {
    getServicePrices: vi.fn(),
    setLevelPrices: vi.fn(),
    setStaffPrices: vi.fn(),
    getStaffServicePrices: vi.fn(),
    setStaffServicePrices: vi.fn(),
  };
  const levelsController = new PriceLevelsController(levels as never);
  const pricesController = new ServicePricesController(prices as never);
  const token = tokenPayload(BusinessRole.OWNER);
  const level = {
    id: 'level-1',
    locationId: 'location-1',
    name: 'Top',
    sortOrder: 1,
    isDefault: false,
    staffCount: 3,
  };

  beforeEach(() => vi.resetAllMocks());

  it('maps price levels to the contract shape', async () => {
    levels.list.mockResolvedValue([level]);
    const result = await levelsController.list('location-1');
    expect(result.responseValue).toEqual([
      {
        id: 'level-1',
        name: 'Top',
        sortOrder: 1,
        isDefault: false,
        staffCount: 3,
      },
    ]);
  });

  it('creates, updates and deletes a level with an audit actor', async () => {
    levels.create.mockResolvedValue(level);
    levels.update.mockResolvedValue({ ...level, isDefault: true });
    const created = await levelsController.create(
      'location-1',
      { name: 'Top' },
      token,
    );
    expect(created.responseValue?.id).toBe('level-1');
    expect(levels.create).toHaveBeenCalledWith(
      'location-1',
      { name: 'Top' },
      expect.objectContaining({ id: 'user-1' }),
    );
    const updated = await levelsController.update(
      'location-1',
      'level-1',
      { isDefault: true },
      token,
    );
    expect(updated.responseValue?.isDefault).toBe(true);
    await expect(
      levelsController.delete('location-1', 'level-1', token),
    ).resolves.toBeUndefined();
    expect(levels.delete).toHaveBeenCalledWith(
      'location-1',
      'level-1',
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  it('returns service prices as two-digit strings', async () => {
    prices.getServicePrices.mockResolvedValue({
      serviceId: 'cut',
      basePrice: d('50'),
      priceFrom: d('50'),
      priceTo: d('95.5'),
      levels: [
        {
          levelId: 'top',
          name: 'Top',
          isDefault: false,
          price: d('80'),
          staffCount: 1,
        },
      ],
      staff: [
        {
          staffId: 'a',
          name: 'Anna',
          avatarFile: { id: 'f', fileName: 'a.png', url: 'https://cdn/a.png' },
          status: 'ACTIVE',
          levelId: 'top',
          levelName: 'Top',
          levelPrice: d('80'),
          personalPrice: d('95.5'),
          price: d('95.5'),
        },
      ],
    });
    const result = await pricesController.getServicePrices('location-1', 'cut');
    expect(result.responseValue).toEqual({
      serviceId: 'cut',
      basePrice: '50.00',
      priceFrom: '50.00',
      priceTo: '95.50',
      levels: [
        {
          levelId: 'top',
          name: 'Top',
          isDefault: false,
          price: '80.00',
          staffCount: 1,
        },
      ],
      staff: [
        {
          staffId: 'a',
          name: 'Anna',
          avatarUrl: 'https://cdn/a.png',
          status: 'ACTIVE',
          levelId: 'top',
          levelName: 'Top',
          levelPrice: '80.00',
          personalPrice: '95.50',
          price: '95.50',
        },
      ],
    });
  });

  it('returns staff service prices with a null personal price', async () => {
    prices.getStaffServicePrices.mockResolvedValue({
      staffId: 'a',
      levelId: null,
      items: [
        {
          serviceId: 'cut',
          serviceTitle: 'Cut',
          basePrice: d('50'),
          levelPrice: d('50'),
          personalPrice: null,
          price: d('50'),
        },
      ],
    });
    const result = await pricesController.getStaffServicePrices(
      'location-1',
      'a',
    );
    expect(result.responseValue).toEqual({
      staffId: 'a',
      levelId: null,
      items: [
        {
          serviceId: 'cut',
          serviceTitle: 'Cut',
          basePrice: '50.00',
          levelPrice: '50.00',
          personalPrice: null,
          price: '50.00',
        },
      ],
    });
  });

  describe('price rules', () => {
    const rules = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setEnabled: vi.fn(),
      archive: vi.fn(),
      restore: vi.fn(),
      duplicate: vi.fn(),
    };
    const bookings = { getPriceRuleStats: vi.fn() };
    const rulesController = new PriceRulesController(
      rules as never,
      {} as never,
      {} as never,
      bookings as never,
    );
    const view = {
      rule: priceRuleRecord({
        id: 'rule-1',
        scheduleType: PriceScheduleType.WEEKLY,
        value: '20',
        weekdaysMask: 0b0110000,
        intervals: [[1020, 1260]],
        visitFrom: '2026-12-01',
        appliesToAll: false,
        targets: [[PriceRuleTargetType.SERVICE, 'cut']],
      }),
      targets: [
        {
          type: PriceRuleTargetType.SERVICE,
          id: 'cut',
          name: 'Cut',
          excluded: false,
        },
      ],
      staff: [],
      currency: 'BYN',
      serviceCount: 3,
      status: PriceRuleStatus.SCHEDULED,
      nextDate: '2026-12-04',
    };
    const input = {
      scheduleType: PriceScheduleType.WEEKLY,
      name: 'Evening',
      valueType: PriceValueType.PERCENT,
      value: '20.00',
      weekdays: [5, 6],
      appliesToAll: true,
    };

    beforeEach(() =>
      bookings.getPriceRuleStats.mockResolvedValue(new Map()),
    );

    it('maps a rule to the contract shape', async () => {
      rules.get.mockResolvedValue(view);
      bookings.getPriceRuleStats.mockResolvedValue(
        new Map([
          [
            'rule-1',
            {
              ruleId: 'rule-1',
              amount: d('21'),
              bookingsCount: 2,
              revenue: d('0'),
              newClients: 0,
              usageCount: 0,
            },
          ],
        ]),
      );
      const result = await rulesController.get('location-1', 'rule-1');
      expect(result.responseValue).toEqual({
        id: 'rule-1',
        kind: 'SURCHARGE',
        scheduleType: 'WEEKLY',
        name: 'Evening',
        note: null,
        enabled: true,
        archived: false,
        valueType: 'PERCENT',
        value: '20.00',
        visitFrom: '2026-12-01',
        visitTo: null,
        yearly: false,
        holidayExclusive: false,
        weekdays: [5, 6],
        intervals: [{ start: '17:00', end: '21:00' }],
        dates: [],
        appliesToAll: false,
        targets: [{ type: 'SERVICE', id: 'cut', name: 'Cut', excluded: false }],
        serviceCount: 3,
        status: 'SCHEDULED',
        nextDate: '2026-12-04',
        stats30d: {
          amount: '21.00',
          bookingsCount: 2,
          revenue: null,
          newClients: null,
        },
        scenario: null,
        publicName: null,
        publicDescription: null,
        showAsPromotion: true,
        bookingFrom: null,
        bookingTo: null,
        minLeadMinutes: null,
        maxLeadMinutes: null,
        channels: [],
        staff: [],
        clientFilter: 'ANY',
        birthdayWindowDays: null,
        promoCode: null,
        usageLimitTotal: null,
        usageLimitPerClient: null,
        usageLimitPeriod: null,
        minVisitTotal: null,
        usageCount: 0,
        conditions: [],
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        updatedAt: new Date('2026-11-01T10:00:00.000Z'),
      });
      expect(rules.get).toHaveBeenCalledWith('location-1', 'rule-1');
      expect(bookings.getPriceRuleStats).toHaveBeenCalledWith(
        'location-1',
        ['rule-1'],
      );
    });

    it('shows zero stats for a rule no booking used', async () => {
      rules.get.mockResolvedValue(view);
      const result = await rulesController.get('location-1', 'rule-1');
      expect(result.responseValue?.stats30d).toEqual({
        amount: '0.00',
        bookingsCount: 0,
        revenue: null,
        newClients: null,
      });
    });

    it('lists with one stats read for all rules, live rules by default', async () => {
      rules.list.mockResolvedValue([
        view,
        { ...view, rule: { ...view.rule, id: 'rule-2' } },
      ]);
      const result = await rulesController.list('location-1', {});
      expect(rules.list).toHaveBeenCalledWith('location-1', false, 'SURCHARGE');
      expect(result.responseValue?.map((rule) => rule.id)).toEqual([
        'rule-1',
        'rule-2',
      ]);
      expect(bookings.getPriceRuleStats).toHaveBeenCalledTimes(1);
      expect(bookings.getPriceRuleStats).toHaveBeenCalledWith(
        'location-1',
        ['rule-1', 'rule-2'],
      );
    });

    it('lists the archived rules on request', async () => {
      rules.list.mockResolvedValue([]);
      await rulesController.list('location-1', { archived: true });
      expect(rules.list).toHaveBeenCalledWith('location-1', true, 'SURCHARGE');
    });

    it('passes the audit actor to every write', async () => {
      rules.create.mockResolvedValue(view);
      rules.update.mockResolvedValue(view);
      rules.setEnabled.mockResolvedValue(view);
      rules.archive.mockResolvedValue(view);
      rules.restore.mockResolvedValue(view);
      rules.duplicate.mockResolvedValue(view);
      const actor = expect.objectContaining({ id: 'user-1' });
      await rulesController.create('location-1', input, token);
      expect(rules.create).toHaveBeenCalledWith('location-1', input, actor);
      await rulesController.update('location-1', 'rule-1', input, token);
      expect(rules.update).toHaveBeenCalledWith(
        'location-1',
        'rule-1',
        input,
        actor,
      );
      await rulesController.setEnabled(
        'location-1',
        'rule-1',
        { enabled: false },
        token,
      );
      expect(rules.setEnabled).toHaveBeenCalledWith(
        'location-1',
        'rule-1',
        false,
        actor,
      );
      await rulesController.archive('location-1', 'rule-1', token);
      expect(rules.archive).toHaveBeenCalledWith('location-1', 'rule-1', actor);
      await rulesController.restore('location-1', 'rule-1', token);
      expect(rules.restore).toHaveBeenCalledWith('location-1', 'rule-1', actor);
      const copy = await rulesController.duplicate(
        'location-1',
        'rule-1',
        token,
      );
      expect(rules.duplicate).toHaveBeenCalledWith(
        'location-1',
        'rule-1',
        actor,
      );
      expect(copy.responseValue?.id).toBe('rule-1');
    });
  });

  describe('pricing settings', () => {
    const locations = { updatePriceRoundingStep: vi.fn() };
    const settingsController = new PricingSettingsController(
      locations as never,
    );

    it('sets the rounding step with an audit actor and answers it as a string', async () => {
      locations.updatePriceRoundingStep.mockResolvedValue({
        priceRoundingStep: d('0.5'),
      });
      const result = await settingsController.update(
        'location-1',
        { priceRoundingStep: '0.50' },
        token,
      );
      expect(locations.updatePriceRoundingStep).toHaveBeenCalledWith(
        'location-1',
        '0.50',
        expect.objectContaining({ id: 'user-1' }),
      );
      expect(result.responseValue).toEqual({ priceRoundingStep: '0.50' });
    });
  });

  describe('permissions', () => {
    const reads: [new (...args: never[]) => object, string][] = [
      [PriceLevelsController, 'list'],
      [ServicePricesController, 'getServicePrices'],
      [ServicePricesController, 'getStaffServicePrices'],
      [PriceRulesController, 'list'],
      [PriceRulesController, 'get'],
    ];
    const writes: [new (...args: never[]) => object, string][] = [
      [PriceLevelsController, 'create'],
      [PriceLevelsController, 'update'],
      [PriceLevelsController, 'delete'],
      [ServicePricesController, 'setLevelPrices'],
      [ServicePricesController, 'setStaffPrices'],
      [ServicePricesController, 'setStaffServicePrices'],
      [PriceRulesController, 'create'],
      [PriceRulesController, 'update'],
      [PriceRulesController, 'setEnabled'],
      [PriceRulesController, 'archive'],
      [PriceRulesController, 'restore'],
      [PriceRulesController, 'duplicate'],
      [PricingSettingsController, 'update'],
    ];

    it.each([...reads, ...writes])(
      '%s.%s is open to the owner and the manager, closed to staff',
      (controller, handler) => {
        expect(allowed(controller, handler, BusinessRole.OWNER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.MANAGER)).toBe(true);
        expect(allowed(controller, handler, BusinessRole.STAFF)).toBe(false);
      },
    );
  });
});
