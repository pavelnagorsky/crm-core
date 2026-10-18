import { Permission } from '../../../access/enums/permission.enum.js';
import { tokenPayload } from '../../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from '../../../staff/services/staff-access.service.js';
import { BookingsAnalyticsRequestDto } from '../dto/bookings-analytics-request.dto.js';
import { BookingsAnalyticsWidgetKey } from '../enums/bookings-analytics-widget-key.enum.js';
import { BookingsAnalyticsController } from './bookings-analytics.controller.js';

describe('Personal booking results', () => {
  const analytics = { getWidgets: vi.fn().mockResolvedValue([]) };
  const staff = {
    resolveOwnProfile: vi.fn().mockResolvedValue({ id: 'anna' }),
  };
  const controller = new BookingsAnalyticsController(
    analytics as never,
    new StaffAccessService(staff as never),
  );
  const dto = {
    keys: [BookingsAnalyticsWidgetKey.OCCUPANCY],
    staffId: 'boris',
  } as BookingsAnalyticsRequestDto;

  beforeEach(() => vi.clearAllMocks());

  it('keeps results personal even when reading all bookings is allowed', async () => {
    const token = tokenPayload('STAFF');
    token.permissions!['L:location-1'].push(Permission.BOOKING_READ);
    await controller.analytics('location-1', dto, token);
    expect(analytics.getWidgets).toHaveBeenCalledWith('location-1', {
      ...dto,
      staffId: 'anna',
    });
  });

  it('preserves unrestricted manager analytics', async () => {
    await controller.analytics('location-1', dto, tokenPayload('MANAGER'));
    expect(analytics.getWidgets).toHaveBeenCalledWith('location-1', dto);
    expect(staff.resolveOwnProfile).not.toHaveBeenCalled();
  });
});
