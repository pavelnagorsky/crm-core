import { NotFoundException } from '@nestjs/common';
import { Prisma, PromotionLimitPeriod } from '@prisma/client';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PricingContextService } from './pricing-context.service.js';

const NOW = new Date('2026-11-23T09:00:00.000Z');
const VISIT = new Date('2026-12-10T10:00:00.000Z');

type LimitRow = {
  id: string;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  usageLimitPeriod: PromotionLimitPeriod | null;
};

/** The SQL text of a tagged $queryRaw call, nested Prisma.sql fragments included. */
const sqlOf = (args: unknown[]) =>
  [
    ...(args[0] as string[]),
    ...args
      .slice(1)
      .map((value) =>
        typeof value === 'object' && value !== null && 'sql' in value
          ? String((value as { sql: unknown }).sql)
          : '',
      ),
  ].join(' ');

/** Parameters of a tagged $queryRaw call (Prisma.join values flattened). */
const valuesOf = (args: unknown[]): unknown[] =>
  args.slice(1).flatMap((value) =>
    typeof value === 'object' &&
    value !== null &&
    'values' in value &&
    !(value instanceof Date)
      ? (value as { values: unknown[] }).values
      : [value],
  );

function setup(
  options: {
    limits?: LimitRow[];
    usage?: { ruleId: string; total: number; perClient: number }[];
    earlierBooking?: boolean;
    earlierSale?: boolean;
    client?: Record<string, unknown> | null;
    edited?: Record<string, unknown> | null;
  } = {},
) {
  const calls: unknown[][] = [];
  const db = {
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return sqlOf(args).includes('WITH uses')
        ? (options.usage ?? [])
        : (options.limits ?? []);
    }),
    booking: {
      findFirst: vi.fn(async () =>
        options.earlierBooking ? { id: 'earlier' } : null,
      ),
      findUnique: vi.fn(async () =>
        options.edited === null
          ? null
          : {
              id: 'booking-1',
              locationId: 'location-1',
              createdAt: NOW,
              deletedAt: null,
              ...options.edited,
            },
      ),
    },
    order: {
      findFirst: vi.fn(async () =>
        options.earlierSale ? { id: 'sale' } : null,
      ),
    },
  };
  const client =
    options.client === undefined
      ? null
      : options.client === null
        ? null
        : {
            id: 'client-1',
            importedAt: null,
            birthDate: null,
            servicesDiscountPercent: null,
            productsDiscountPercent: null,
            ...options.client,
          };
  const clients = {
    findForBooking: vi.fn(async () => client),
    findByPhoneForBooking: vi.fn(async () => client),
  };
  const service = new PricingContextService(db as never, clients as never);
  const request = {
    locationId: 'location-1',
    brandId: 'brand-1',
    timezone: 'Europe/Minsk',
    channel: PromotionChannel.ONLINE,
    visitStartAt: VISIT,
    now: NOW,
  };
  return { service, db, clients, calls, request };
}

const limited = (id: string, overrides: Partial<LimitRow> = {}): LimitRow => ({
  id,
  usageLimitTotal: null,
  usageLimitPerClient: null,
  usageLimitPeriod: null,
  ...overrides,
});

describe('PricingContextService', () => {
  describe('the clock and the request', () => {
    it('takes the location today, the visit start, the trimmed code and the choice', async () => {
      const { service, request } = setup();
      const context = await service.build({
        ...request,
        // 23:30 UTC is already the 24th in Minsk.
        now: new Date('2026-11-23T23:30:00.000Z'),
        promoCode: ' AUTUMN ',
        choice: { 0: { mode: 'NONE' as never } },
      });
      expect(context).toMatchObject({
        channel: PromotionChannel.ONLINE,
        today: '2026-11-24',
        visitStartMs: VISIT.getTime(),
        promoCode: 'AUTUMN',
        usage: {},
        choice: { 0: { mode: 'NONE' } },
      });
    });

    it('a booking moved later keeps the day it was booked for the booking period', async () => {
      const { service, request } = setup();
      const context = await service.build({
        ...request,
        bookedAt: new Date('2026-11-01T08:00:00.000Z'),
      });
      expect(context.today).toBe('2026-11-01');
      expect(context.nowMs).toBe(NOW.getTime());
    });

    it('a sale has no visit start', async () => {
      const { service, request } = setup();
      const context = await service.build({
        ...request,
        visitStartAt: null,
        sale: true,
        promoCode: '  ',
      });
      expect(context.promoCode).toBeNull();
      expect(context.visitStartMs).toBeNull();
    });
  });

  describe('the client', () => {
    it('no id and no phone: unknown, no discounts', async () => {
      const { service, request, clients } = setup();
      const { client } = await service.build(request);
      expect(client).toEqual({
        known: false,
        isNew: false,
        birthday: null,
        servicesDiscountBp: null,
        productsDiscountBp: null,
      });
      expect(clients.findByPhoneForBooking).not.toHaveBeenCalled();
    });

    it('a phone the brand does not know: a new client', async () => {
      const { service, request } = setup({ client: null });
      const { client } = await service.build({
        ...request,
        phone: '+375291112233',
      });
      expect(client).toMatchObject({ known: true, isNew: true });
    });

    it('reads the birthday and both personal discounts', async () => {
      const { service, request } = setup({
        client: {
          birthDate: new Date('1990-03-01T00:00:00.000Z'),
          servicesDiscountPercent: new Prisma.Decimal('15.50'),
          productsDiscountPercent: new Prisma.Decimal('5.00'),
        },
      });
      const { client } = await service.build({ ...request, clientId: 'client-1' });
      expect(client).toMatchObject({
        birthday: '03-01',
        servicesDiscountBp: 1550,
        productsDiscountBp: 500,
      });
    });

    it.each([
      ['booking: without bookings - new', false, {}, false, false, true],
      ['booking: a live booking - returning', false, {}, true, false, false],
      ['booking: an earlier sale does not matter', false, {}, false, true, true],
      ['sale: without bookings and sales - new', true, {}, false, false, true],
      ['sale: a live booking - returning', true, {}, true, false, false],
      ['sale: a confirmed sale - returning', true, {}, false, true, false],
      ['sale: imported - never new', true, { importedAt: NOW }, false, false, false],
    ])('%s', async (_name, sale, fields, earlierBooking, earlierSale, isNew) => {
      const { service, request } = setup({
        client: fields,
        earlierBooking,
        earlierSale,
      });
      const { client } = await service.build({
        ...request,
        clientId: 'client-1',
        sale,
        visitStartAt: sale ? null : VISIT,
      });
      expect(client.isNew).toBe(isNew);
    });

    it('a sale does not count its own order as an earlier sale', async () => {
      const { service, request, db } = setup({ client: {} });
      await service.build({
        ...request,
        clientId: 'client-1',
        sale: true,
        orderId: 'order-1',
        visitStartAt: null,
      });
      expect(db.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientId: 'client-1',
            status: 'ACTIVE',
            id: { not: 'order-1' },
            items: {
              some: { type: 'PRODUCT', status: 'CONFIRMED' },
            },
          }),
        }),
      );
    });

    it('the edited booking must be a live booking of the location', async () => {
      const { service, request } = setup({ edited: { deletedAt: NOW } });
      await expect(
        service.build({ ...request, bookingId: 'booking-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('promotion uses', () => {
    it('counts nothing when no promotion has a limit', async () => {
      const { service, request, calls } = setup();
      const { usage } = await service.build(request);
      expect(usage).toEqual({});
      expect(calls).toHaveLength(1);
    });

    it('one query counts visits (items and product lines) and sales, excluding drafts and voided sales', async () => {
      const { service, request, calls } = setup({
        limits: [limited('a', { usageLimitTotal: 5 })],
        usage: [{ ruleId: 'a', total: 3, perClient: 1 }],
        client: {},
      });
      const { usage } = await service.build({ ...request, clientId: 'client-1' });
      expect(usage).toEqual({ a: { total: 3, perClient: 1 } });
      const sql = sqlOf(calls[1]);
      expect(sql).toContain('"BookingItemPriceAdjustment"');
      expect(sql).toContain('"OrderItemPriceAdjustment"');
      expect(sql).toContain('oi."status" = \'CONFIRMED\'');
      expect(sql).toContain('o."status" = \'ACTIVE\'');
      expect(sql).toContain('COUNT(DISTINCT u."unit")');
      // A visit order counts as its booking: one use for its items and product lines.
      expect(sql).toContain("'B:' || o.\"bookingId\"");
    });

    it('leaves out the own booking and order', async () => {
      const { service, request, calls } = setup({
        limits: [limited('a', { usageLimitTotal: 5 })],
      });
      await service.build({
        ...request,
        bookingId: 'booking-1',
        orderId: 'order-1',
      });
      const values = valuesOf(calls[1]);
      expect(values).toContain('B:booking-1');
      expect(values).toContain('O:order-1');
    });

    it('an unknown client has no uses of its own', async () => {
      const { service, request } = setup({
        limits: [limited('a', { usageLimitPerClient: 1, usageLimitPeriod: 'MONTH' })],
        usage: [{ ruleId: 'a', total: 2, perClient: 2 }],
      });
      const { usage } = await service.build(request);
      expect(usage).toEqual({ a: { total: 2, perClient: 0 } });
    });

    it('locks the limited promotions only inside a transaction', async () => {
      const outside = setup();
      await outside.service.build(outside.request);
      expect(sqlOf(outside.calls[0])).not.toContain('FOR UPDATE');
      const inside = setup();
      await inside.service.build({ ...inside.request, tx: inside.db as never });
      expect(sqlOf(inside.calls[0])).toContain('FOR UPDATE');
    });

    it('reads without a lock in a transaction that prices drafts only', async () => {
      const { service, request, db, calls } = setup();
      await service.build({ ...request, tx: db as never, lockLimits: false });
      expect(sqlOf(calls[0])).toContain('"PriceRule"');
      expect(sqlOf(calls[0])).not.toContain('FOR UPDATE');
    });

    it('lockLimits locks the limited promotions of the location', async () => {
      const { service, db, calls } = setup();
      await service.lockLimits(db as never, 'location-1');
      expect(sqlOf(calls[0])).toContain('FOR UPDATE');
      expect(valuesOf(calls[0])).toContain('location-1');
    });
  });

  describe('assertLimitsHeld', () => {
    it.each([
      ['room left', { usageLimitTotal: 2 }, { total: 1, perClient: 0 }, null],
      ['total reached', { usageLimitTotal: 1 }, { total: 1, perClient: 0 }, 'LIMIT_REACHED'],
      [
        'client limit reached',
        { usageLimitPerClient: 1, usageLimitPeriod: 'ALL_TIME' as const },
        { total: 1, perClient: 1 },
        'CLIENT_LIMIT_REACHED',
      ],
    ])('%s', async (_name, limits, counted, reason) => {
      const { service, db } = setup({
        limits: [limited('a', limits)],
        usage: [{ ruleId: 'a', ...counted }],
      });
      const check = service.assertLimitsHeld(
        db as never,
        'location-1',
        ['a', null],
        'client-1',
        VISIT,
        null,
        'order-1',
      );
      if (reason === null) await expect(check).resolves.toBeUndefined();
      else
        await expect(check).rejects.toMatchObject({
          errorCode: 'PROMOTION_NOT_APPLICABLE',
          payload: expect.objectContaining({ ruleId: 'a', reason }),
        });
    });

    it('does nothing when no line uses a promotion', async () => {
      const { service, db } = setup();
      await service.assertLimitsHeld(db as never, 'location-1', [null], null, VISIT);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
