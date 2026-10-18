import { ForbiddenException } from '@nestjs/common';
import { tokenPayload } from '../../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from '../../../staff/services/staff-access.service.js';
import { StaffEarningsController } from './staff-earnings.controller.js';

describe('Own earnings API', () => {
  const earnings = { search: vi.fn() };
  const staff = {
    resolveOwnProfile: vi.fn().mockResolvedValue({ id: 'anna' }),
  };
  const controller = new StaffEarningsController(
    earnings as never,
    new StaffAccessService(staff as never),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    earnings.search.mockResolvedValue({ items: [], totalItems: 0 });
  });

  it('forces own earnings despite caller staff ID and unpaginated request', async () => {
    const dto = { page: 1, pageSize: 10, staffId: 'boris', isExport: true };
    await controller.search('location-1', dto, tokenPayload('STAFF'));
    expect(earnings.search).toHaveBeenCalledWith('location-1', {
      ...dto,
      staffId: 'anna',
    });
  });

  it('rejects another employee earnings endpoint before querying earnings', async () => {
    await expect(
      controller.listForStaff(
        'location-1',
        'boris',
        { page: 1, pageSize: 10 },
        tokenPayload('STAFF'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(earnings.search).not.toHaveBeenCalled();
  });

  it('keeps manager filters unrestricted', async () => {
    const dto = { page: 1, pageSize: 10, staffId: 'boris' };
    await controller.search('location-1', dto, tokenPayload('MANAGER'));
    expect(earnings.search).toHaveBeenCalledWith('location-1', dto);
    expect(staff.resolveOwnProfile).not.toHaveBeenCalled();
  });
});
