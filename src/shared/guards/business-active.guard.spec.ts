import {
  BadRequestException,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { BusinessActiveGuard } from './business-active.guard.js';

describe('BusinessActiveGuard', () => {
  const brandId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const brands = { findById: vi.fn() };
  const locations = { findById: vi.fn() };
  const guard = new BusinessActiveGuard(brands as never, locations as never);
  const context = (params: Record<string, string | undefined>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ params }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => vi.resetAllMocks());

  it('allows reference and account endpoints without a business', async () => {
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
    expect(brands.findById).not.toHaveBeenCalled();
    expect(locations.findById).not.toHaveBeenCalled();
  });

  it('checks both scopes for a nested business endpoint', async () => {
    await expect(
      guard.canActivate(context({ brandId, locationId })),
    ).resolves.toBe(true);
    expect(brands.findById).toHaveBeenCalledWith(brandId);
    expect(locations.findById).toHaveBeenCalledWith(locationId);
  });

  it('rejects a deleted brand before any endpoint can run', async () => {
    brands.findById.mockRejectedValue(new NotFoundException());
    await expect(
      guard.canActivate(context({ brandId })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a deleted location or a location in a deleted brand', async () => {
    locations.findById.mockRejectedValue(new NotFoundException());
    await expect(
      guard.canActivate(context({ locationId })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queries current state again after a database restoration', async () => {
    locations.findById
      .mockRejectedValueOnce(new NotFoundException())
      .mockResolvedValueOnce({ id: locationId });
    await expect(
      guard.canActivate(context({ locationId })),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(guard.canActivate(context({ locationId }))).resolves.toBe(
      true,
    );
  });

  it.each([{ brandId: 'invalid' }, { locationId: 'invalid' }])(
    'rejects malformed IDs before querying the database: %j',
    async (params) => {
      await expect(guard.canActivate(context(params))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(brands.findById).not.toHaveBeenCalled();
      expect(locations.findById).not.toHaveBeenCalled();
    },
  );
});
