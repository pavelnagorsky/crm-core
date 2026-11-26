import { HttpStatus } from '@nestjs/common';
import {
  PriceRuleKind,
  PriceRuleTargetType,
  PriceScheduleType,
  PriceValueType,
  PromotionChannel,
} from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { priceRuleRecord } from '../testing/price-rule-record.factory.js';
import { PriceRulesService } from './price-rules.service.js';

const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
const NOW = new Date('2026-11-23T10:00:00.000Z');

const input = (over: Partial<PriceRuleInputDto> = {}): PriceRuleInputDto => ({
  scheduleType: PriceScheduleType.WEEKLY,
  name: 'Evening',
  valueType: PriceValueType.PERCENT,
  value: '20.00',
  weekdays: [5, 6],
  intervals: [{ start: '17:00', end: '21:00' }],
  appliesToAllServices: true,
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

const holidayRecord = (id: string, dates: string[], over = {}) =>
  priceRuleRecord({
    id,
    name: `Holiday ${id}`,
    scheduleType: PriceScheduleType.HOLIDAYS,
    holidayExclusive: true,
    dates,
    ...over,
  });

const invalidField = async (promise: Promise<unknown>) => {
  const error = (await promise.then(
    () => null,
    (caught: unknown) => caught,
  )) as { errorCode: string; payload: { field: string }; status?: number };
  expect(error?.errorCode).toBe('PRICE_RULE_INVALID');
  return error.payload.field;
};

describe('PriceRulesService', () => {
  const events = { emit: vi.fn() };
  const cache = { invalidate: vi.fn() };
  const reads = {
    listRules: vi.fn(),
    findRule: vi.fn(),
    listExclusiveHolidays: vi.fn(),
    findPromoCodeOwner: vi.fn(),
  };
  const catalog = {
    assertTargetsInLocation: vi.fn(),
    nameTargets: vi.fn(),
    loadCoverage: vi.fn(),
  };
  const locations = { getBookingSettings: vi.fn() };
  const staff = { listInLocation: vi.fn(), namesByIds: vi.fn() };
  const tx = {
    $executeRaw: vi.fn(),
    priceRule: { create: vi.fn(), update: vi.fn() },
    priceRuleTarget: { deleteMany: vi.fn() },
    priceRuleInterval: { deleteMany: vi.fn() },
    priceRuleDate: { deleteMany: vi.fn() },
    priceRuleStaff: { deleteMany: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(),
    priceRuleTarget: { deleteMany: vi.fn(), findMany: vi.fn() },
  };
  const service = new PriceRulesService(
    db as never,
    reads as never,
    catalog as never,
    locations as never,
    staff as never,
    cache as never,
    events as never,
  );

  const emitted = () =>
    events.emit.mock.calls.map(([, event]) => event as Record<string, unknown>);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ now: NOW });
    db.$transaction.mockImplementation((operation) => operation(tx));
    staff.namesByIds.mockResolvedValue(new Map());
    staff.listInLocation.mockResolvedValue([]);
    reads.findPromoCodeOwner.mockResolvedValue(null);
    catalog.assertTargetsInLocation.mockResolvedValue(undefined);
    catalog.nameTargets.mockResolvedValue([]);
    catalog.loadCoverage.mockResolvedValue({ services: [], bundles: [] });
    locations.getBookingSettings.mockResolvedValue({
      timezone: 'Europe/Minsk',
    });
    reads.listExclusiveHolidays.mockResolvedValue([]);
    tx.priceRule.create.mockImplementation(async ({ data }) =>
      priceRuleRecord({ id: 'new', name: data.name }),
    );
  });

  afterEach(() => vi.useRealTimers());

  describe('create', () => {
    it('stores a normalized rule under the location lock and clears the price cache', async () => {
      const view = await service.create('location', input(), actor);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      const { data } = tx.priceRule.create.mock.calls[0][0];
      expect(data).toMatchObject({
        locationId: 'location',
        kind: 'SURCHARGE',
        scheduleType: 'WEEKLY',
        name: 'Evening',
        enabled: true,
        valueType: 'PERCENT',
        value: '20.00',
        weekdaysMask: 0b0110000,
        appliesToAllServices: true,
        createdById: 'owner',
      });
      expect(data.intervals.create).toEqual([
        { startMinute: 1020, endMinute: 1260 },
      ]);
      expect(cache.invalidate).toHaveBeenCalledWith(
        CacheDependency.pricing('location'),
      );
      expect(view.rule.id).toBe('new');
    });

    it('audits the creation', async () => {
      await service.create('location', input(), actor);
      expect(emitted()).toEqual([
        expect.objectContaining({
          locationId: 'location',
          entityType: 'PRICE_RULE',
          entityId: 'new',
          eventType: AuditEvent.PRICE_RULE_CREATED,
          payload: { name: 'Evening', kind: 'SURCHARGE' },
        }),
      ]);
    });

    it('creates the rule disabled when asked to', async () => {
      await service.create('location', input({ enabled: false }), actor);
      expect(tx.priceRule.create.mock.calls[0][0].data.enabled).toBe(false);
    });

    it('stores targets and holiday dates', async () => {
      await service.create(
        'location',
        holidayInput({
          appliesToAllServices: false,
          targets: [{ type: PriceRuleTargetType.BUNDLE, id: 'combo' }],
        }),
        actor,
      );
      const { data } = tx.priceRule.create.mock.calls[0][0];
      expect(data.targets.create).toEqual([
        { targetType: 'BUNDLE', targetId: 'combo', excluded: false },
      ]);
      expect(data.dates.create).toEqual([
        { date: new Date('2027-03-08T00:00:00.000Z') },
      ]);
      expect(catalog.assertTargetsInLocation).toHaveBeenCalledWith('location', [
        { type: 'BUNDLE', id: 'combo', excluded: false },
      ]);
    });

    it('writes nothing for an invalid rule', async () => {
      expect(
        await invalidField(
          service.create('location', input({ weekdays: [] }), actor),
        ),
      ).toBe('weekdays');
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('rejects targets that are not in the location', async () => {
      catalog.assertTargetsInLocation.mockRejectedValue(
        Object.assign(new Error('x'), { errorCode: 'PRICE_RULE_INVALID' }),
      );
      await expect(
        service.create(
          'location',
          input({
            appliesToAllServices: false,
            targets: [{ type: PriceRuleTargetType.SERVICE, id: 'foreign' }],
          }),
          actor,
        ),
      ).rejects.toMatchObject({ errorCode: 'PRICE_RULE_INVALID' });
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    describe('holiday conflicts', () => {
      it('answers 409 with the rule and the date of the conflict', async () => {
        reads.listExclusiveHolidays.mockResolvedValue([
          holidayRecord('other', ['2027-03-08']),
        ]);
        await expect(
          service.create('location', holidayInput(), actor),
        ).rejects.toMatchObject({
          errorCode: 'PRICE_RULE_HOLIDAY_CONFLICT',
          status: HttpStatus.CONFLICT,
          payload: {
            ruleId: 'other',
            ruleName: 'Holiday other',
            date: '2027-03-08',
          },
        });
        expect(tx.priceRule.create).not.toHaveBeenCalled();
        expect(cache.invalidate).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      });

      it('checks under the same lock transaction, for the saved location', async () => {
        await service.create('location', holidayInput(), actor);
        expect(reads.listExclusiveHolidays).toHaveBeenCalledWith(
          'location',
          null,
          tx,
        );
        expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
          reads.listExclusiveHolidays.mock.invocationCallOrder[0],
        );
      });

      it('does not check a holiday rule without the exclusive flag', async () => {
        await service.create(
          'location',
          holidayInput({ holidayExclusive: false }),
          actor,
        );
        expect(reads.listExclusiveHolidays).not.toHaveBeenCalled();
      });

      it('does not check a rule saved disabled', async () => {
        await service.create(
          'location',
          holidayInput({ enabled: false }),
          actor,
        );
        expect(reads.listExclusiveHolidays).not.toHaveBeenCalled();
      });

      it('does not check other schedule types', async () => {
        await service.create('location', input(), actor);
        expect(reads.listExclusiveHolidays).not.toHaveBeenCalled();
      });

      it('lets two holiday rules share a date when the dates differ', async () => {
        reads.listExclusiveHolidays.mockResolvedValue([
          holidayRecord('other', ['2027-05-01']),
        ]);
        await expect(
          service.create('location', holidayInput(), actor),
        ).resolves.toBeDefined();
      });
    });
  });

  describe('update', () => {
    const current = priceRuleRecord({
      id: 'rule-1',
      weekdaysMask: 0b0110000,
      intervals: [[1020, 1260]],
    });

    beforeEach(() => {
      reads.findRule.mockResolvedValue(current);
      tx.priceRule.update.mockImplementation(async ({ data }) =>
        priceRuleRecord({
          id: 'rule-1',
          name: data.name,
          value: data.value,
          weekdaysMask: data.weekdaysMask,
          intervals: [[1020, 1260]],
        }),
      );
    });

    it('replaces the children and the fields, then clears the cache', async () => {
      await service.update(
        'location',
        'rule-1',
        input({ name: 'Late', value: '25.00' }),
        actor,
      );
      expect(tx.priceRuleTarget.deleteMany).toHaveBeenCalledWith({
        where: { ruleId: 'rule-1' },
      });
      expect(tx.priceRuleInterval.deleteMany).toHaveBeenCalled();
      expect(tx.priceRuleDate.deleteMany).toHaveBeenCalled();
      expect(tx.priceRule.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'rule-1' },
        data: { name: 'Late', value: '25.00', enabled: true },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(
        CacheDependency.pricing('location'),
      );
    });

    it('keeps the enabled flag when the input does not name it', async () => {
      reads.findRule.mockResolvedValue({ ...current, enabled: false });
      await service.update('location', 'rule-1', input(), actor);
      expect(tx.priceRule.update.mock.calls[0][0].data.enabled).toBe(false);
    });

    it('audits the changed fields only', async () => {
      await service.update(
        'location',
        'rule-1',
        input({ name: 'Late', value: '25.00' }),
        actor,
      );
      const [event] = emitted();
      expect(event).toMatchObject({
        eventType: AuditEvent.PRICE_RULE_UPDATED,
        entityId: 'rule-1',
      });
      const { changes } = event.payload as {
        changes: { field: string; from: string; to: string }[];
      };
      expect(changes.map((change) => change.field)).toEqual(['name', 'value']);
      expect(changes[0]).toMatchObject({ from: 'Evening', to: 'Late' });
    });

    it('does not audit a save that changes nothing', async () => {
      tx.priceRule.update.mockResolvedValue(current);
      await service.update('location', 'rule-1', input(), actor);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('answers 409 for an archived rule and writes nothing', async () => {
      reads.findRule.mockResolvedValue({
        ...current,
        archivedAt: new Date('2026-11-20'),
      });
      await expect(
        service.update('location', 'rule-1', input(), actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_RULE_ARCHIVED',
        status: HttpStatus.CONFLICT,
      });
      expect(tx.priceRule.update).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('answers 404 for a rule of another location', async () => {
      reads.findRule.mockRejectedValue(
        Object.assign(new Error('x'), {
          errorCode: 'PRICE_RULE_NOT_FOUND',
          status: 404,
        }),
      );
      await expect(
        service.update('location', 'rule-1', input(), actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_RULE_NOT_FOUND' });
      expect(reads.findRule).toHaveBeenCalledWith('location', 'rule-1');
    });

    it('does not count the rule itself as a holiday conflict', async () => {
      reads.findRule.mockResolvedValue(holidayRecord('rule-1', ['2027-03-08']));
      await service.update('location', 'rule-1', holidayInput(), actor);
      expect(reads.listExclusiveHolidays).toHaveBeenCalledWith(
        'location',
        'rule-1',
        tx,
      );
    });

    it('answers 409 when the new dates hit another exclusive holiday', async () => {
      reads.findRule.mockResolvedValue(holidayRecord('rule-1', ['2027-05-01']));
      reads.listExclusiveHolidays.mockResolvedValue([
        holidayRecord('other', ['2027-03-08']),
      ]);
      await expect(
        service.update('location', 'rule-1', holidayInput(), actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_RULE_HOLIDAY_CONFLICT' });
      expect(tx.priceRuleTarget.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('disables a rule, audits it and clears the cache', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord());
      tx.priceRule.update.mockResolvedValue(
        priceRuleRecord({ enabled: false }),
      );
      const view = await service.setEnabled('location', 'rule-1', false, actor);
      expect(tx.priceRule.update.mock.calls[0][0]).toMatchObject({
        data: { enabled: false },
      });
      expect(emitted()[0]).toMatchObject({
        eventType: AuditEvent.PRICE_RULE_DISABLED,
        payload: { name: 'Evening' },
      });
      expect(cache.invalidate).toHaveBeenCalled();
      expect(view.status).toBe(PriceRuleStatus.DISABLED);
    });

    it('audits enabling with its own event', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord({ enabled: false }));
      tx.priceRule.update.mockResolvedValue(priceRuleRecord());
      await service.setEnabled('location', 'rule-1', true, actor);
      expect(emitted()[0]).toMatchObject({
        eventType: AuditEvent.PRICE_RULE_ENABLED,
      });
    });

    it('changes nothing when the rule already has the state', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord());
      await service.setEnabled('location', 'rule-1', true, actor);
      expect(tx.priceRule.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('answers 409 for an archived rule', async () => {
      reads.findRule.mockResolvedValue(
        priceRuleRecord({ archivedAt: new Date('2026-11-20') }),
      );
      await expect(
        service.setEnabled('location', 'rule-1', true, actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_RULE_ARCHIVED' });
    });

    it('checks the holiday conflict when an exclusive holiday is enabled', async () => {
      reads.findRule.mockResolvedValue(
        holidayRecord('rule-1', ['2027-03-08'], { enabled: false }),
      );
      reads.listExclusiveHolidays.mockResolvedValue([
        holidayRecord('other', ['2027-03-08']),
      ]);
      await expect(
        service.setEnabled('location', 'rule-1', true, actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_RULE_HOLIDAY_CONFLICT',
        payload: { ruleId: 'other', date: '2027-03-08' },
      });
      expect(tx.priceRule.update).not.toHaveBeenCalled();
    });

    it('does not check the conflict when an exclusive holiday is disabled', async () => {
      reads.findRule.mockResolvedValue(holidayRecord('rule-1', ['2027-03-08']));
      tx.priceRule.update.mockResolvedValue(
        holidayRecord('rule-1', ['2027-03-08'], { enabled: false }),
      );
      await service.setEnabled('location', 'rule-1', false, actor);
      expect(reads.listExclusiveHolidays).not.toHaveBeenCalled();
    });
  });

  describe('archive and restore', () => {
    const archivedAt = new Date('2026-11-20T00:00:00.000Z');

    it('archives a live rule', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord());
      tx.priceRule.update.mockResolvedValue(priceRuleRecord({ archivedAt }));
      const view = await service.archive('location', 'rule-1', actor);
      expect(tx.priceRule.update.mock.calls[0][0].data.archivedAt).toEqual(NOW);
      expect(emitted()[0]).toMatchObject({
        eventType: AuditEvent.PRICE_RULE_ARCHIVED,
      });
      expect(cache.invalidate).toHaveBeenCalledWith(
        CacheDependency.pricing('location'),
      );
      expect(view.status).toBe(PriceRuleStatus.ARCHIVED);
    });

    it('archiving an archived rule changes nothing', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord({ archivedAt }));
      await service.archive('location', 'rule-1', actor);
      expect(tx.priceRule.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });

    it('restores an archived rule', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord({ archivedAt }));
      tx.priceRule.update.mockResolvedValue(priceRuleRecord());
      await service.restore('location', 'rule-1', actor);
      expect(tx.priceRule.update.mock.calls[0][0].data).toEqual({
        archivedAt: null,
      });
      expect(emitted()[0]).toMatchObject({
        eventType: AuditEvent.PRICE_RULE_RESTORED,
      });
      expect(cache.invalidate).toHaveBeenCalled();
    });

    it('restoring a live rule changes nothing', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord());
      await service.restore('location', 'rule-1', actor);
      expect(tx.priceRule.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('answers 409 when the restored holiday hits another exclusive holiday', async () => {
      reads.findRule.mockResolvedValue(
        holidayRecord('rule-1', ['2027-03-08'], { archivedAt }),
      );
      reads.listExclusiveHolidays.mockResolvedValue([
        holidayRecord('other', ['2027-03-08']),
      ]);
      await expect(
        service.restore('location', 'rule-1', actor),
      ).rejects.toMatchObject({ errorCode: 'PRICE_RULE_HOLIDAY_CONFLICT' });
      expect(tx.priceRule.update).not.toHaveBeenCalled();
    });

    it('restores a disabled exclusive holiday without a conflict check', async () => {
      reads.findRule.mockResolvedValue(
        holidayRecord('rule-1', ['2027-03-08'], { archivedAt, enabled: false }),
      );
      tx.priceRule.update.mockResolvedValue(
        holidayRecord('rule-1', ['2027-03-08'], { enabled: false }),
      );
      await service.restore('location', 'rule-1', actor);
      expect(reads.listExclusiveHolidays).not.toHaveBeenCalled();
    });
  });

  describe('duplicate', () => {
    it('copies the rule as a disabled "(копия)" with its targets, intervals and dates', async () => {
      reads.findRule.mockResolvedValue(
        priceRuleRecord({
          id: 'rule-1',
          name: 'Evening',
          weekdaysMask: 0b0110000,
          intervals: [[1020, 1260]],
          appliesToAllServices: false,
          targets: [[PriceRuleTargetType.SERVICE, 'cut']],
        }),
      );
      tx.priceRule.create.mockImplementation(async ({ data }) =>
        priceRuleRecord({ id: 'copy', name: data.name, enabled: false }),
      );
      const view = await service.duplicate('location', 'rule-1', actor);
      const { data } = tx.priceRule.create.mock.calls[0][0];
      expect(data).toMatchObject({
        locationId: 'location',
        name: 'Evening (копия)',
        enabled: false,
        weekdaysMask: 0b0110000,
        createdById: 'owner',
      });
      expect(data.targets.create).toEqual([
        { targetType: 'SERVICE', targetId: 'cut', excluded: false },
      ]);
      expect(data.intervals.create).toEqual([
        { startMinute: 1020, endMinute: 1260 },
      ]);
      expect(view.status).toBe(PriceRuleStatus.DISABLED);
      expect(emitted()[0]).toMatchObject({
        entityId: 'copy',
        eventType: AuditEvent.PRICE_RULE_CREATED,
        payload: { name: 'Evening (копия)', copiedFrom: 'rule-1' },
      });
      expect(cache.invalidate).toHaveBeenCalled();
    });

    it('keeps the copied name within the name limit', async () => {
      reads.findRule.mockResolvedValue(
        priceRuleRecord({ name: 'x'.repeat(100) }),
      );
      tx.priceRule.create.mockResolvedValue(priceRuleRecord({ id: 'copy' }));
      await service.duplicate('location', 'rule-1', actor);
      const { name } = tx.priceRule.create.mock.calls[0][0].data;
      expect(name).toHaveLength(100);
      expect(name.endsWith(' (копия)')).toBe(true);
    });

    it('copies an archived rule as a live one', async () => {
      reads.findRule.mockResolvedValue(
        priceRuleRecord({ archivedAt: new Date('2026-11-20') }),
      );
      tx.priceRule.create.mockResolvedValue(priceRuleRecord({ id: 'copy' }));
      await service.duplicate('location', 'rule-1', actor);
      expect(
        tx.priceRule.create.mock.calls[0][0].data.archivedAt,
      ).toBeUndefined();
    });
  });

  describe('list and get', () => {
    it('lists live rules with status, next date, target names and coverage', async () => {
      reads.listRules.mockResolvedValue([
        priceRuleRecord({
          weekdaysMask: 1 << 4,
          appliesToAllServices: false,
          targets: [[PriceRuleTargetType.SERVICE, 'cut']],
        }),
      ]);
      catalog.nameTargets.mockResolvedValue([
        { type: 'SERVICE', id: 'cut', excluded: false, name: 'Cut' },
      ]);
      catalog.loadCoverage.mockResolvedValue({
        services: [
          { id: 'cut', categoryId: null },
          { id: 'color', categoryId: null },
        ],
        bundles: [],
      });
      const [view] = await service.list('location', false, PriceRuleKind.SURCHARGE, NOW);
      expect(reads.listRules).toHaveBeenCalledWith('location', false, PriceRuleKind.SURCHARGE);
      expect(view).toMatchObject({
        status: PriceRuleStatus.ACTIVE,
        nextDate: '2026-11-27',
        serviceCount: 1,
        targets: [{ type: 'SERVICE', id: 'cut', name: 'Cut', excluded: false }],
      });
    });

    it('lists the archived rules on request', async () => {
      reads.listRules.mockResolvedValue([]);
      expect(await service.list('location', true, PriceRuleKind.SURCHARGE, NOW)).toEqual([]);
      expect(reads.listRules).toHaveBeenCalledWith('location', true, PriceRuleKind.SURCHARGE);
      expect(locations.getBookingSettings).not.toHaveBeenCalled();
    });

    it('takes today from the location time zone', async () => {
      reads.listRules.mockResolvedValue([
        priceRuleRecord({ visitFrom: '2026-11-24' }),
      ]);
      // 23:30 UTC on the 23rd is already the 24th in Minsk (UTC+3).
      const lateNow = new Date('2026-11-23T23:30:00.000Z');
      const [view] = await service.list('location', false, PriceRuleKind.SURCHARGE, lateNow);
      expect(view.status).toBe(PriceRuleStatus.ACTIVE);
      expect(view.nextDate).toBe('2026-11-24');
    });

    it('names a target that is gone with null', async () => {
      reads.listRules.mockResolvedValue([
        priceRuleRecord({
          appliesToAllServices: false,
          targets: [[PriceRuleTargetType.BUNDLE, 'gone']],
        }),
      ]);
      const [view] = await service.list('location', false, PriceRuleKind.SURCHARGE, NOW);
      expect(view.targets[0].name).toBeNull();
    });

    it('gets one rule of the location', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord());
      const view = await service.get('location', 'rule-1', NOW);
      expect(reads.findRule).toHaveBeenCalledWith('location', 'rule-1');
      expect(view.rule.id).toBe('rule-1');
    });
  });

  describe('removeTargets', () => {
    it('deletes the targets of a removed item of the location and clears the cache', async () => {
      db.priceRuleTarget.deleteMany.mockResolvedValue({ count: 2 });
      await service.removeTargets(
        'location',
        PriceRuleTargetType.SERVICE,
        'cut',
      );
      expect(db.priceRuleTarget.deleteMany).toHaveBeenCalledWith({
        where: {
          targetType: 'SERVICE',
          targetId: 'cut',
          rule: { locationId: 'location' },
        },
      });
      expect(cache.invalidate).toHaveBeenCalledWith(
        CacheDependency.pricing('location'),
      );
    });

    it('leaves the cache alone when nothing pointed at the item', async () => {
      db.priceRuleTarget.deleteMany.mockResolvedValue({ count: 0 });
      await service.removeTargets(
        'location',
        PriceRuleTargetType.BUNDLE,
        'combo',
      );
      expect(cache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('removeBrandTargets (docs/pricing-stage7-api.md)', () => {
    const where = {
      targetType: 'PRODUCT',
      targetId: 'shampoo',
      rule: { location: { brandId: 'brand' } },
    };

    it('deletes the targets of a deleted product in every location of the brand', async () => {
      db.priceRuleTarget.findMany.mockResolvedValue([
        { rule: { locationId: 'a' } },
        { rule: { locationId: 'b' } },
        { rule: { locationId: 'a' } },
      ]);
      db.priceRuleTarget.deleteMany.mockResolvedValue({ count: 3 });
      await service.removeBrandTargets(
        'brand',
        PriceRuleTargetType.PRODUCT,
        'shampoo',
      );
      expect(db.priceRuleTarget.deleteMany).toHaveBeenCalledWith({ where });
      expect(cache.invalidate).toHaveBeenCalledTimes(2);
      expect(cache.invalidate).toHaveBeenCalledWith(CacheDependency.pricing('a'));
      expect(cache.invalidate).toHaveBeenCalledWith(CacheDependency.pricing('b'));
    });

    it('does nothing when no rule targeted it', async () => {
      db.priceRuleTarget.findMany.mockResolvedValue([]);
      await service.removeBrandTargets(
        'brand',
        PriceRuleTargetType.PRODUCT,
        'shampoo',
      );
      expect(db.priceRuleTarget.deleteMany).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('promotions', () => {
    const promo = (over: Partial<PriceRuleInputDto> = {}) =>
      input({
        kind: PriceRuleKind.PROMOTION,
        weekdays: [],
        publicName: 'Утро',
        channels: [PromotionChannel.ONLINE],
        ...over,
      });
    const promoRecord = (over: Parameters<typeof priceRuleRecord>[0] = {}) =>
      priceRuleRecord({
        id: 'rule-1',
        kind: PriceRuleKind.PROMOTION,
        ...over,
      });

    beforeEach(() => {
      staff.listInLocation.mockResolvedValue([
        { id: 'anna', status: 'ACTIVE' },
        { id: 'gone', status: 'INACTIVE' },
      ]);
      staff.namesByIds.mockResolvedValue(new Map([['anna', 'Анна']]));
      tx.priceRule.create.mockImplementation(async ({ data }) =>
        promoRecord({ id: 'new', name: data.name }),
      );
      tx.priceRule.update.mockImplementation(async () => promoRecord());
    });

    it('stores the promotion fields, staff and an upper-case code', async () => {
      await service.create(
        'location',
        promo({ staffIds: ['anna'], promoCode: 'autumn' }),
        actor,
      );
      const { data } = tx.priceRule.create.mock.calls[0][0];
      expect(data).toMatchObject({
        kind: 'PROMOTION',
        publicName: 'Утро',
        channels: ['ONLINE'],
        promoCode: 'AUTUMN',
        clientFilter: 'ANY',
        showAsPromotion: true,
        staff: { create: [{ staffId: 'anna' }] },
      });
      expect(reads.findPromoCodeOwner).toHaveBeenCalledWith(
        'location',
        'AUTUMN',
        null,
        tx,
      );
    });

    it('answers 409 PROMO_CODE_TAKEN with the other promotion', async () => {
      reads.findPromoCodeOwner.mockResolvedValue({ id: 'other', name: 'Осень' });
      await expect(
        service.create('location', promo({ promoCode: 'AUTUMN' }), actor),
      ).rejects.toMatchObject({
        errorCode: 'PROMO_CODE_TAKEN',
        status: HttpStatus.CONFLICT,
        payload: { ruleId: 'other', ruleName: 'Осень' },
      });
      expect(tx.priceRule.create).not.toHaveBeenCalled();
    });

    it('reports a unique index hit as PROMO_CODE_TAKEN', async () => {
      const { Prisma } = await import('@prisma/client');
      tx.priceRule.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      reads.findPromoCodeOwner
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'race', name: 'Гонка' });
      await expect(
        service.create('location', promo({ promoCode: 'AUTUMN' }), actor),
      ).rejects.toMatchObject({
        errorCode: 'PROMO_CODE_TAKEN',
        payload: { ruleId: 'race', ruleName: 'Гонка' },
      });
    });

    it('rejects staff that is not active in the location', async () => {
      await expect(
        service.create('location', promo({ staffIds: ['gone'] }), actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_RULE_INVALID',
        payload: { field: 'staffIds' },
      });
    });

    it('keeps staff the rule already has on update, and replaces the staff rows', async () => {
      reads.findRule.mockResolvedValue(
        promoRecord({ promotion: { staffIds: ['gone'] } }),
      );
      await service.update(
        'location',
        'rule-1',
        promo({ staffIds: ['gone', 'anna'] }),
        actor,
      );
      expect(tx.priceRuleStaff.deleteMany).toHaveBeenCalledWith({
        where: { ruleId: 'rule-1' },
      });
      const { data } = tx.priceRule.update.mock.calls[0][0];
      expect(data.staff).toEqual({
        create: [{ staffId: 'anna' }, { staffId: 'gone' }],
      });
    });

    it('does not let an update change the kind', async () => {
      reads.findRule.mockResolvedValue(priceRuleRecord({ id: 'rule-1' }));
      await expect(
        service.update('location', 'rule-1', promo(), actor),
      ).rejects.toMatchObject({
        errorCode: 'PRICE_RULE_INVALID',
        payload: { field: 'kind' },
      });
    });

    it('a copy keeps the conditions and staff but not the promo code', async () => {
      reads.findRule.mockResolvedValue(
        promoRecord({
          promotion: {
            promoCode: 'AUTUMN',
            usageLimitTotal: 10,
            staffIds: ['anna'],
          },
        }),
      );
      await service.duplicate('location', 'rule-1', actor);
      const { data } = tx.priceRule.create.mock.calls[0][0];
      expect(data).toMatchObject({
        kind: 'PROMOTION',
        promoCode: null,
        usageLimitTotal: 10,
        enabled: false,
        staff: { create: [{ staffId: 'anna' }] },
      });
    });

    it('restoring a promotion whose code is taken answers PROMO_CODE_TAKEN', async () => {
      reads.findRule.mockResolvedValue(
        promoRecord({
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
          promotion: { promoCode: 'AUTUMN' },
        }),
      );
      reads.findPromoCodeOwner.mockResolvedValue({ id: 'other', name: 'Осень' });
      await expect(
        service.restore('location', 'rule-1', actor),
      ).rejects.toMatchObject({ errorCode: 'PROMO_CODE_TAKEN' });
      expect(tx.priceRule.update).not.toHaveBeenCalled();
    });

    it('generates a code nobody has, retrying a taken one', async () => {
      reads.findPromoCodeOwner
        .mockResolvedValueOnce({ id: 'x', name: 'x' })
        .mockResolvedValueOnce(null);
      const code = await service.generatePromoCode('location');
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(reads.findPromoCodeOwner).toHaveBeenCalledTimes(2);
    });

    it('a view names the staff', async () => {
      reads.findRule.mockResolvedValue(
        promoRecord({ promotion: { staffIds: ['anna'] } }),
      );
      const view = await service.get('location', 'rule-1');
      expect(view.staff).toEqual([{ id: 'anna', name: 'Анна' }]);
    });
  });
});
