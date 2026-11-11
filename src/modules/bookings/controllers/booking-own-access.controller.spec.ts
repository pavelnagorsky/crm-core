import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, addGrant, removeGrant } from '../../access/utils/permission.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from '../../staff/services/staff-access.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingAccessService } from '../services/booking-access.service.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingsController } from './bookings.controller.js';

describe('Staff booking API', () => {
  const current = booking({ locationId: 'location-1' });
  const bookings = {
    findByIdInLocation: vi.fn(),
    updateStatus: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    search: vi.fn(),
    getStatusCounts: vi.fn(),
  };
  const staff = {
    resolveOwnProfile: vi.fn().mockResolvedValue({ id: 'anna' }),
  };
  const access = new BookingAccessService(
    new StaffAccessService(staff as never),
  );
  const reviews = { findForBooking: vi.fn() };
  const controller = new BookingsController(
    bookings as never,
    {} as never,
    {} as never,
    {} as never,
    access,
    {} as never,
    reviews as never,
  );
  const review = {
    id: 'review-1',
    locationId: 'location-1',
    bookingId: current.id,
    clientId: null,
    authorFirstName: 'Анна',
    authorLastName: 'Козлова',
    rating: 2,
    text: 'Долго ждали',
    reviewedAt: new Date('2026-10-01T10:00:00Z'),
    status: 'HIDDEN',
    hiddenAt: new Date('2026-10-02T10:00:00Z'),
    hiddenReason: 'спам',
    replyText: null,
    repliedAt: null,
    repliedByName: null,
    source: null,
    importKey: null,
    importBatchId: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-02T10:00:00Z'),
    staff: [{ reviewId: 'review-1', staffId: 'anna', staffName: 'Анна' }],
  };
  const guard = new PermissionGuard(new Reflector());

  beforeEach(() => {
    vi.clearAllMocks();
    bookings.findByIdInLocation.mockResolvedValue(current);
    reviews.findForBooking.mockResolvedValue(review);
    bookings.updateStatus.mockResolvedValue(current);
    bookings.cancel.mockResolvedValue(current);
    bookings.search.mockResolvedValue({ items: [], totalItems: 0 });
    bookings.getStatusCounts.mockResolvedValue([]);
  });

  it.each([
    'createManual',
    'export',
    'delete',
    'addProduct',
    'addItems',
    'generateClientToken',
  ] as const)('denies the administrative endpoint %s', (operation) => {
    const context = {
      getHandler: () => BookingsController.prototype[operation],
      getClass: () => BookingsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: tokenPayload('STAFF'),
          params: { locationId: 'location-1' },
        }),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each([
    BookingStatus.CONFIRMED,
    BookingStatus.NO_SHOW,
    BookingStatus.COMPLETED,
  ] as const)(
    'allows the participant to set %s without order management',
    async (status) => {
      await controller.updateStatus(
        'location-1',
        current.id,
        { status },
        tokenPayload('STAFF'),
      );
      expect(bookings.updateStatus).toHaveBeenCalledWith(
        current,
        expect.objectContaining({ id: 'user-1' }),
        { status },
      );
    },
  );

  it.each([true, false])(
    'returns isCustomTime=%s in booking details and search',
    async (isCustomTime) => {
      const visit = booking({ locationId: 'location-1', isCustomTime });
      bookings.findByIdInLocation.mockResolvedValueOnce(visit);
      bookings.search.mockResolvedValueOnce({ items: [visit], totalItems: 1 });

      const details = await controller.findById(
        'location-1',
        visit.id,
        tokenPayload('STAFF'),
      );
      const search = await controller.search(
        'location-1',
        { page: 1, pageSize: 10 },
        tokenPayload('STAFF'),
      );

      expect(details.responseValue).toMatchObject({
        source: 'MANUAL',
        isCustomTime,
      });
      expect(search.responseValue?.items[0]).toMatchObject({
        source: 'MANUAL',
        isCustomTime,
      });
    },
  );

  it('shows the review of the visit, hidden ones included, to review readers', async () => {
    const details = await controller.findById(
      'location-1',
      current.id,
      tokenPayload('MANAGER'),
    );
    expect(reviews.findForBooking).toHaveBeenCalledWith(current.id);
    expect(details.responseValue?.review).toMatchObject({
      id: 'review-1',
      rating: 2,
      status: 'HIDDEN',
      hiddenReason: 'спам',
      staff: [{ id: 'anna', name: 'Анна' }],
    });
  });

  it('keeps the review away from participants without review:read', async () => {
    const details = await controller.findById(
      'location-1',
      current.id,
      tokenPayload('STAFF'),
    );
    expect(details.responseValue?.review).toBeNull();

    const manager = tokenPayload('MANAGER');
    removeGrant(manager.permissions!['L:location-1'], Read(Claim.REVIEW));
    const withoutGrant = await controller.findById(
      'location-1',
      current.id,
      manager,
    );
    expect(withoutGrant.responseValue?.review).toBeNull();
    expect(reviews.findForBooking).not.toHaveBeenCalled();
  });

  it('returns null when the visit has no review', async () => {
    reviews.findForBooking.mockResolvedValue(null);
    const details = await controller.findById(
      'location-1',
      current.id,
      tokenPayload('MANAGER'),
    );
    expect(details.responseValue?.review).toBeNull();
  });

  it('allows cancellation before completion', async () => {
    await controller.cancel(
      'location-1',
      current.id,
      {},
      tokenPayload('STAFF'),
    );
    expect(bookings.cancel).toHaveBeenCalledOnce();
  });

  it('rejects all mutations of another booking before invoking the write service', async () => {
    bookings.findByIdInLocation.mockResolvedValue(
      booking({ locationId: 'location-1', item: { staffId: 'boris' } }),
    );
    const token = tokenPayload('STAFF');
    addGrant(token.permissions!['L:location-1'], Read(Claim.BOOKING));
    await expect(
      controller.updateStatus(
        'location-1',
        current.id,
        { status: BookingStatus.COMPLETED },
        token,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.cancel('location-1', current.id, {}, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.update('location-1', current.id, { notes: 'changed' }, token),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bookings.updateStatus).not.toHaveBeenCalled();
    expect(bookings.cancel).not.toHaveBeenCalled();
    expect(bookings.update).not.toHaveBeenCalled();
  });

  it('denies cancellation and status reversal after completion', async () => {
    bookings.findByIdInLocation.mockResolvedValue({
      ...current,
      status: BookingStatus.COMPLETED,
    });
    await expect(
      controller.cancel('location-1', current.id, {}, tokenPayload('STAFF')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.updateStatus(
        'location-1',
        current.id,
        { status: BookingStatus.NO_SHOW },
        tokenPayload('STAFF'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bookings.cancel).not.toHaveBeenCalled();
    expect(bookings.updateStatus).not.toHaveBeenCalled();
  });

  it('passes mandatory participation to lists and counters', async () => {
    const dto = { page: 1, pageSize: 10, staffIds: ['boris'], isExport: true };
    await controller.search('location-1', dto, tokenPayload('STAFF'));
    await controller.getStatusCounts('location-1', tokenPayload('STAFF'));
    expect(bookings.search).toHaveBeenCalledWith('location-1', dto, 'anna');
    expect(bookings.getStatusCounts).toHaveBeenCalledWith('location-1', 'anna');
  });
});
