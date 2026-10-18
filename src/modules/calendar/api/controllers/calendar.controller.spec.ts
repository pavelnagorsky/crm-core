import { ForbiddenException } from '@nestjs/common';
import { Permission } from '../../../access/enums/permission.enum.js';
import { tokenPayload } from '../../../auth/testing/factories/token-payload.factory.js';
import { BookingAccessService } from '../../../bookings/services/booking-access.service.js';
import { StaffAccessService } from '../../../staff/services/staff-access.service.js';
import { CalendarController } from './calendar.controller.js';

describe('Staff calendar visibility', () => {
  const events = { findInLocation: vi.fn() };
  const view = { getCalendar: vi.fn(), getManualAvailableSlots: vi.fn() };
  const staff = {
    resolveOwnProfile: vi.fn().mockResolvedValue({ id: 'anna' }),
  };
  const access = new BookingAccessService(
    new StaffAccessService(staff as never),
  );
  const controller = new CalendarController(
    events as never,
    view as never,
    access,
  );
  const range = { from: '2026-10-01', to: '2026-10-02' };

  beforeEach(() => vi.clearAllMocks());

  it('forces the own calendar even if another staff filter was supplied', async () => {
    await controller.getCalendar(
      'location-1',
      { ...range, staffIds: ['boris'] },
      tokenPayload('STAFF'),
    );
    expect(view.getCalendar).toHaveBeenCalledWith('location-1', {
      ...range,
      staffIds: ['anna'],
    });
  });

  it('keeps caller filters when broader calendar reading is enabled', async () => {
    const token = tokenPayload('STAFF');
    token.permissions!['L:location-1'].push(Permission.BOOKING_READ);
    const dto = { ...range, staffIds: ['boris'] };
    await controller.getCalendar('location-1', dto, token);
    expect(view.getCalendar).toHaveBeenCalledWith('location-1', dto);
    expect(staff.resolveOwnProfile).not.toHaveBeenCalled();
  });

  it.each([null, 'anna'])(
    'allows reading a block with staffId=%s',
    async (staffId) => {
      events.findInLocation.mockResolvedValue({
        id: 'block',
        staffId,
        startDateTime: new Date('2026-10-01T09:00:00Z'),
        endDateTime: new Date('2026-10-01T10:00:00Z'),
      });
      await expect(
        controller.getEvent('location-1', 'block', tokenPayload('STAFF')),
      ).resolves.toMatchObject({ isSuccess: true });
    },
  );

  it('denies another staff block by its direct ID', async () => {
    events.findInLocation.mockResolvedValue({ id: 'block', staffId: 'boris' });
    await expect(
      controller.getEvent('location-1', 'block', tokenPayload('STAFF')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the edited booking used to exclude availability events', async () => {
    const dto = { ...range, bookingId: 'booking' };
    await controller.getManualAvailableSlots(
      'location-1',
      dto,
      tokenPayload('STAFF'),
    );
    expect(view.getManualAvailableSlots).toHaveBeenCalledWith(
      'location-1',
      dto,
      'anna',
    );
  });
});
