import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingReservationService } from './booking-reservation.service.js';

describe('BookingReservationService idempotency', () => {
  const request = {
    idempotencyKey: 'key',
    creationRequestHash: 'a'.repeat(64),
  };
  const tx = { $executeRaw: vi.fn(), booking: { findUnique: vi.fn() } };
  const db = { $transaction: vi.fn(async (run) => run(tx)) };
  const location = { acquireActiveOperationLock: vi.fn() };
  const service = new BookingReservationService(
    db as never,
    location as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const create = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation(async (run) => run(tx));
    location.acquireActiveOperationLock.mockResolvedValue(true);
    tx.booking.findUnique.mockResolvedValue(null);
  });

  it('locks the request before preparation and passes the same transaction to creation', async () => {
    const result = {
      booking: booking(),
      timezone: 'UTC',
      currency: 'BYN',
      bundleTitle: null,
    };
    create.mockResolvedValue(result);
    await expect(
      service.reserveOnce('location', request, create),
    ).resolves.toEqual({ ...result, created: true });
    expect(create).toHaveBeenCalledExactlyOnceWith(tx);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.booking.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.booking.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
    expect(tx.$executeRaw.mock.calls[0][1]).toBe(
      JSON.stringify(['booking-create', 'location', 'key']),
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30_000,
    });
  });

  it('replays the stored booking without preparing a new reservation', async () => {
    const existing = booking({ ...request });
    tx.booking.findUnique.mockResolvedValue(existing);
    await expect(
      service.reserveOnce('location', request, create),
    ).resolves.toEqual({ booking: existing, created: false });
    expect(create).not.toHaveBeenCalled();
    expect(tx.booking.findUnique).toHaveBeenCalledWith({
      where: {
        locationId_idempotencyKey: {
          locationId: 'location',
          idempotencyKey: 'key',
        },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it.each([
    { creationRequestHash: 'other' },
    { creationRequestHash: null },
    { deletedAt: new Date() },
  ])(
    'rejects a conflicting or removed booking without creation: %j',
    async (patch) => {
      tx.booking.findUnique.mockResolvedValue(
        booking({ ...request, ...patch }),
      );
      await expect(
        service.reserveOnce('location', request, create),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.BOOKING_IDEMPOTENCY_CONFLICT.code,
        status: 409,
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('does not return an existing booking from an inactive location', async () => {
    location.acquireActiveOperationLock.mockResolvedValue(false);
    await expect(
      service.reserveOnce('location', request, create),
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.booking.findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
