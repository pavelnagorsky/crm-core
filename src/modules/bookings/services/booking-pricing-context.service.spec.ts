import { NotFoundException } from '@nestjs/common';
import { Prisma, PromotionLimitPeriod } from '@prisma/client';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingPricingContextService } from './booking-pricing-context.service.js';

const DAY = 86_400_000;
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

function setup(
  options: {
    limits?: LimitRow[];
    totals?: { ruleId: string; total: number }[];
    clientBookings?: { startAt: Date; ruleIds: string[] }[];
    earlierBooking?: boolean;
    client?: Record<string, unknown> | null;
    edited?: Record<string, unknown> | null;
  } = {},
) {
  const queries: string[] = [];
  const db = {
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      const sql = sqlOf(args);
      queries.push(sql);
      return sql.includes('FROM "PriceRule"')
        ? (options.limits ?? [])
        : (options.totals ?? []);
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
      findMany: vi.fn(async () =>
        (options.clientBookings ?? []).map((booking) => ({
          startAt: booking.startAt,
          items: [
            {
              priceAdjustments: booking.ruleIds.map((ruleId) => ({ ruleId })),
            },
          ],
        })),
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
            discountPercent: null,
            ...options.client,
          };
  const clients = {
    findForBooking: vi.fn(async () => client),
    findByPhoneForBooking: vi.fn(async () => client),
  };
  const service = new BookingPricingContextService(
    db as never,
    clients as never,
  );
  const request = {
    locationId: 'location-1',
    brandId: 'brand-1',
    timezone: 'Europe/Minsk',
    channel: PromotionChannel.ONLINE,
    visitStartAt: VISIT,
    now: NOW,
  };
  return { service, db, clients, queries, request };
}

const limited = (
  id: string,
  overrides: Partial<LimitRow> = {},
): LimitRow => ({
  id,
  usageLimitTotal: null,
  usageLimitPerClient: null,
  usageLimitPeriod: null,
  ...overrides,
});

describe('BookingPricingContextService', () => {
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

    it('an empty code is none, an unknown start is null', async () => {
      const { service, request } = setup();
      const context = await service.build({
        ...request,
        visitStartAt: null,
        promoCode: '  ',
      });
      expect(context.promoCode).toBeNull();
      expect(context.visitStartMs).toBeNull();
    });
  });

  describe('the client', () => {
    it('no id and no phone: unknown', async () => {
      const { service, request, clients } = setup();
      const { client } = await service.build(request);
      expect(client).toEqual({
        known: false,
        isNew: false,
        birthday: null,
        discountBp: null,
      });
      expect(clients.findByPhoneForBooking).not.toHaveBeenCalled();
    });

    it('a phone the brand does not know: a new client', async () => {
      const { service, request, clients } = setup({ client: null });
      const { client } = await service.build({
        ...request,
        phone: '+375291112233',
      });
      expect(clients.findByPhoneForBooking).toHaveBeenCalledWith(
        'brand-1',
        '+375291112233',
      );
      expect(client).toEqual({
        known: true,
        isNew: true,
        birthday: null,
        discountBp: null,
      });
    });

    it.each([
      ['without bookings: new', {}, false, true],
      ['with a live booking: returning', {}, true, false],
      ['imported: never new', { importedAt: NOW }, false, false],
    ])('%s', async (_name, fields, earlierBooking, isNew) => {
      const { service, request } = setup({ client: fields, earlierBooking });
      const { client } = await service.build({
        ...request,
        phone: '+375291112233',
      });
      expect(client.isNew).toBe(isNew);
    });

    it('reads the birthday and the personal discount', async () => {
      const { service, request } = setup({
        client: {
          birthDate: new Date('1990-03-01T00:00:00.000Z'),
          discountPercent: new Prisma.Decimal('15.50'),
        },
      });
      const { client } = await service.build({ ...request, clientId: 'client-1' });
      expect(client).toMatchObject({ birthday: '03-01', discountBp: 1550 });
    });

    it('a returning client: live bookings of the brand before the edited one', async () => {
      const { service, request, db } = setup({ client: {} });
      await service.build({
        ...request,
        clientId: 'client-1',
        bookingId: 'booking-1',
      });
      expect(db.booking.findFirst).toHaveBeenCalledWith({
        where: {
          clientId: 'client-1',
          deletedAt: null,
          status: { not: BookingStatus.CANCELLED },
          id: { not: 'booking-1' },
          createdAt: { lt: NOW },
        },
        select: { id: true },
      });
    });

    it.each([
      ['unknown', null],
      ['of another location', { locationId: 'location-2' }],
      ['deleted', { deletedAt: NOW }],
    ] as const)('an edited booking %s is a 404', async (_name, edited) => {
      const { service, request } = setup({ edited });
      await expect(
        service.build({ ...request, bookingId: 'booking-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('an unknown clientId is a 404', async () => {
      const { service, request } = setup({ client: null });
      await expect(
        service.build({ ...request, clientId: 'ghost' }),
      ).rejects.toMatchObject({ errorCode: 'BOOKING_CLIENT_NOT_FOUND' });
    });
  });

  describe('promotion uses', () => {
    it('counts nothing when no promotion has a limit', async () => {
      const { service, request, db, queries } = setup({ client: {} });
      const { usage } = await service.build({ ...request, clientId: 'client-1' });
      expect(usage).toEqual({});
      expect(queries).toHaveLength(1);
      expect(db.booking.findMany).not.toHaveBeenCalled();
    });

    it('counts all live bookings and the client ones within the period around the visit', async () => {
      const { service, request } = setup({
        client: {},
        limits: [
          limited('total', { usageLimitTotal: 100 }),
          limited('monthly', {
            usageLimitPerClient: 1,
            usageLimitPeriod: PromotionLimitPeriod.MONTH,
          }),
          limited('ever', {
            usageLimitPerClient: 1,
            usageLimitPeriod: PromotionLimitPeriod.ALL_TIME,
          }),
        ],
        totals: [
          { ruleId: 'total', total: 34 },
          { ruleId: 'monthly', total: 3 },
        ],
        clientBookings: [
          { startAt: new Date(VISIT.getTime() - 10 * DAY), ruleIds: ['monthly'] },
          { startAt: new Date(VISIT.getTime() - 40 * DAY), ruleIds: ['monthly', 'ever'] },
          { startAt: new Date(VISIT.getTime() + 20 * DAY), ruleIds: ['monthly'] },
        ],
      });
      const { usage } = await service.build({ ...request, clientId: 'client-1' });
      expect(usage).toEqual({
        total: { total: 34, perClient: 0 },
        monthly: { total: 3, perClient: 2 },
        ever: { total: 0, perClient: 1 },
      });
    });

    it('does not count the edited booking, in total or for the client', async () => {
      const { service, request, db } = setup({
        client: {},
        limits: [
          limited('autumn', {
            usageLimitPerClient: 1,
            usageLimitPeriod: PromotionLimitPeriod.ALL_TIME,
          }),
        ],
      });
      await service.build({
        ...request,
        clientId: 'client-1',
        bookingId: 'booking-1',
      });
      const totals = db.$queryRaw.mock.calls.find((args) =>
        sqlOf(args).includes('COUNT(DISTINCT'),
      )!;
      expect(sqlOf(totals)).toContain('b."id" <>');
      expect(totals.slice(1)).toContain('booking-1');
      expect(db.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clientId: 'client-1',
            id: { not: 'booking-1' },
          }),
        }),
      );
    });

    it('an unknown client has no uses of its own', async () => {
      const { service, request, db } = setup({
        limits: [limited('total', { usageLimitTotal: 5 })],
        totals: [{ ruleId: 'total', total: 2 }],
      });
      const { usage } = await service.build(request);
      expect(usage).toEqual({ total: { total: 2, perClient: 0 } });
      expect(db.booking.findMany).not.toHaveBeenCalled();
    });

    it('locks the limited promotions only inside a transaction', async () => {
      const outside = setup();
      await outside.service.build(outside.request);
      expect(outside.queries[0]).not.toContain('FOR UPDATE');

      const inside = setup();
      await inside.service.build({ ...inside.request, tx: inside.db as never });
      expect(inside.queries[0]).toContain('FOR UPDATE');
    });
  });

  describe('assertLimitsHeld', () => {
    it.each([
      ['total reached', { usageLimitTotal: 3 }, 3, 0, 'LIMIT_REACHED'],
      ['client limit reached', { usageLimitPerClient: 1, usageLimitPeriod: PromotionLimitPeriod.ALL_TIME }, 1, 1, 'CLIENT_LIMIT_REACHED'],
      ['room left', { usageLimitTotal: 3 }, 2, 0, null],
    ] as const)('%s', async (_name, limit, total, perClient, reason) => {
      const { service, db } = setup({
        limits: [limited('promo', limit)],
        totals: [{ ruleId: 'promo', total }],
        clientBookings: Array.from({ length: perClient }, () => ({
          startAt: VISIT,
          ruleIds: ['promo'],
        })),
      });
      const check = service.assertLimitsHeld(
        db as never,
        'location-1',
        ['promo'],
        'client-1',
        VISIT,
      );
      if (reason === null) await expect(check).resolves.toBeUndefined();
      else
        await expect(check).rejects.toMatchObject({
          errorCode: 'PROMOTION_NOT_APPLICABLE',
          payload: { ruleId: 'promo', reason },
        });
    });

    it('does nothing when the items use no promotion', async () => {
      const { service, db } = setup();
      await service.assertLimitsHeld(db as never, 'location-1', [null], null, VISIT);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
