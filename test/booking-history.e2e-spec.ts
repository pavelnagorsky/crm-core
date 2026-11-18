import { PrismaPg } from '@prisma/adapter-pg';
import {
  BookingSource,
  BookingStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { BookingHistoryReadService } from '../src/modules/bookings/services/read/booking-history-read.service.js';
import { ClientsService } from '../src/modules/clients/services/clients.service.js';
import { ServiceBundleReadService } from '../src/modules/services/catalog/services/service-bundle-read.service.js';

/**
 * Counting rules of the booking dialog history against a real PostgreSQL. Needs a migrated
 * database in TEST_DATABASE_URL; everything runs in one transaction that is rolled back.
 */
const url = process.env.TEST_DATABASE_URL;
const now = new Date('2026-11-18T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

/** Thrown to roll the seeded transaction back. */
const ROLLBACK = new Error('rollback');

describe.skipIf(!url)('BookingHistoryReadService on PostgreSQL', () => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  afterAll(() => db.$disconnect());

  async function inRolledBackTransaction(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    await db
      .$transaction(
        async (tx) => {
          await run(tx);
          throw ROLLBACK;
        },
        { timeout: 30_000 },
      )
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error;
      });
  }

  async function seed(tx: Prisma.TransactionClient) {
    const brand = await tx.brand.create({
      data: { name: 'booking-history e2e' },
    });
    const location = (name: string, deletedAt: Date | null = null) =>
      tx.location.create({
        data: {
          brandId: brand.id,
          name,
          countryCode: 'BY',
          currency: 'BYN',
          timezone: 'Europe/Minsk',
          deletedAt,
        },
      });
    const here = await location('here');
    const other = await location('other');
    const closed = await location('closed', daysAgo(30));
    const service = (locationId: string, title: string) =>
      tx.service.create({
        data: { locationId, title, price: 40, durationMinutes: 60 },
      });
    const haircut = await service(here.id, 'Haircut');
    const styling = await service(here.id, 'Styling');
    const coloring = await service(other.id, 'Coloring');
    const shave = await service(closed.id, 'Shave');
    const bundle = await tx.serviceBundle.create({
      data: { locationId: here.id, title: 'Haircut and styling' },
    });
    const staff = (locationId: string, name: string) =>
      tx.staff.create({ data: { locationId, name } });
    const anna = await staff(here.id, 'Anna');
    const boris = await staff(here.id, 'Boris');
    const xenia = await staff(other.id, 'Xenia');
    const yan = await staff(closed.id, 'Yan');
    const client = await tx.client.create({
      data: {
        brandId: brand.id,
        firstName: 'Maria',
        lastName: 'Test',
        phone: '+375290000001',
      },
    });

    let order = 0;
    const booking = async (
      locationId: string,
      status: BookingStatus,
      startAt: Date,
      items: { serviceId: string; title: string; staffId: string }[],
      extra: { bundleId?: string; deletedAt?: Date } = {},
    ) => {
      order += 1;
      const endAt = new Date(startAt.getTime() + 3_600_000);
      return tx.booking.create({
        data: {
          locationId,
          clientId: client.id,
          startAt,
          endAt,
          status,
          source: BookingSource.MANUAL,
          clientFirstName: 'Maria',
          clientLastName: `Test ${order}`,
          bundleId: extra.bundleId ?? null,
          deletedAt: extra.deletedAt ?? null,
          items: {
            create: items.map((item, index) => ({
              locationId,
              serviceId: item.serviceId,
              staffId: item.staffId,
              sortOrder: index,
              startAt,
              endAt,
              serviceTitle: item.title,
              serviceDuration: 60,
              listPrice: 40,
              chargedPrice: 40,
              staffName: 'staff',
            })),
          },
        },
      });
    };
    const cut = { serviceId: haircut.id, title: 'Haircut' };
    const style = { serviceId: styling.id, title: 'Styling' };

    await booking(here.id, BookingStatus.COMPLETED, daysAgo(10), [
      { ...cut, staffId: anna.id },
      { ...style, staffId: anna.id },
    ]);
    await booking(here.id, BookingStatus.COMPLETED, daysAgo(5), [
      { ...cut, staffId: boris.id },
    ]);
    const bundleVisit = await booking(
      here.id,
      BookingStatus.COMPLETED,
      daysAgo(3),
      [
        { ...cut, staffId: anna.id },
        { ...style, staffId: boris.id },
      ],
      { bundleId: bundle.id },
    );
    // One visit with the same service twice counts once.
    await booking(here.id, BookingStatus.COMPLETED, daysAgo(20), [
      { ...cut, staffId: anna.id },
      { ...cut, staffId: anna.id },
    ]);
    // Older than the 90-day popularity window, still client history.
    await booking(here.id, BookingStatus.COMPLETED, daysAgo(120), [
      { ...style, staffId: anna.id },
    ]);
    // Not completed or soft-deleted: never counted as visits.
    await booking(here.id, BookingStatus.NO_SHOW, daysAgo(2), [
      { ...cut, staffId: anna.id },
    ]);
    await booking(here.id, BookingStatus.CANCELLED, daysAgo(1), [
      { ...style, staffId: anna.id },
    ]);
    await booking(
      here.id,
      BookingStatus.COMPLETED,
      daysAgo(4),
      [{ ...style, staffId: boris.id }],
      { deletedAt: daysAgo(4) },
    );
    const otherVisit = await booking(
      other.id,
      BookingStatus.COMPLETED,
      daysAgo(1),
      [{ serviceId: coloring.id, title: 'Coloring', staffId: xenia.id }],
    );
    // A deleted location drops out of the brand history.
    await booking(closed.id, BookingStatus.COMPLETED, daysAgo(0.5), [
      { serviceId: shave.id, title: 'Shave', staffId: yan.id },
    ]);
    const next = await booking(
      here.id,
      BookingStatus.CONFIRMED,
      new Date(now.getTime() + 2 * 86_400_000),
      [{ ...cut, staffId: anna.id }],
    );
    await booking(
      here.id,
      BookingStatus.PENDING,
      new Date(now.getTime() + 5 * 86_400_000),
      [{ ...cut, staffId: anna.id }],
    );

    return {
      here,
      other,
      client,
      haircut,
      styling,
      coloring,
      bundle,
      anna,
      boris,
      bundleVisit,
      otherVisit,
      next,
    };
  }

  function history(tx: Prisma.TransactionClient) {
    const bundles = new ServiceBundleReadService(tx as never);
    return new BookingHistoryReadService(
      tx as never,
      {
        findById: (id: string) =>
          tx.location.findUniqueOrThrow({ where: { id } }),
      } as never,
      new ClientsService(tx as never, { emit: () => true } as never),
      { findBundleTitles: (ids: string[]) => bundles.findTitles(ids) } as never,
    );
  }

  it('counts completed visits of the brand by visit, bundles apart from services', async () => {
    await inRolledBackTransaction(async (tx) => {
      const data = await seed(tx);
      const summary = await history(tx).clientSummary(
        data.here.id,
        data.client.id,
        now,
      );

      expect(summary.visits).toBe(6);
      expect(summary.noShows).toBe(1);
      expect(summary.lastVisit?.booking.id).toBe(data.otherVisit.id);
      expect(summary.lastLocationVisit?.booking.id).toBe(data.bundleVisit.id);
      expect(summary.lastLocationVisit?.bundleTitle).toBe(
        'Haircut and styling',
      );
      expect(summary.upcoming?.booking.id).toBe(data.next.id);
      expect(summary.upcomingCount).toBe(2);
      expect(
        summary.services.map((row) => [row.id, row.count, row.locationId]),
      ).toEqual([
        [data.haircut.id, 3, data.here.id],
        [data.styling.id, 2, data.here.id],
        [data.coloring.id, 1, data.other.id],
      ]);
      expect(summary.services[0].lastAt).toEqual(daysAgo(5));
      expect(summary.bundles).toEqual([
        expect.objectContaining({
          id: data.bundle.id,
          title: 'Haircut and styling',
          count: 1,
        }),
      ]);
    });
  });

  it('ranks what each staff member completed in the last 90 days', async () => {
    await inRolledBackTransaction(async (tx) => {
      const data = await seed(tx);
      const popular = await history(tx).popularServices(data.here.id, now);
      const of = (staffId: string) =>
        popular
          .find((entry) => entry.staffId === staffId)
          ?.items.map((item) => [item.kind, item.id, item.count]);

      expect(popular.map((entry) => entry.staffId).sort()).toEqual(
        [data.anna.id, data.boris.id].sort(),
      );
      expect(of(data.anna.id)).toEqual([
        ['SERVICE', data.haircut.id, 2],
        ['BUNDLE', data.bundle.id, 1],
        ['SERVICE', data.styling.id, 1],
      ]);
      expect(of(data.boris.id)).toEqual([
        ['BUNDLE', data.bundle.id, 1],
        ['SERVICE', data.haircut.id, 1],
      ]);
    });
  });
});
