import { Prisma, ServicePriceChangeSkip, ServicePriceChangeTarget } from '@prisma/client';
import { ServicePriceChangeStore } from './service-price-change-store.service.js';

const item = (id: string, over: object) => ({
  id,
  targetType: ServicePriceChangeTarget.LEVEL,
  serviceId: 's1',
  priceLevelId: null,
  staffId: null,
  bundleId: null,
  ...over,
});

describe('ServicePriceChangeStore.loadStates', () => {
  it('skips a level row whose level became the default', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { serviceId: 's1', priceLevelId: 'vip', price: new Prisma.Decimal('50.00') },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const tx = {
      $queryRaw: queryRaw,
      priceLevel: { findMany: vi.fn(async () => [{ id: 'old-vip' }]) },
    };
    const states = await new ServicePriceChangeStore().loadStates(tx as never, [
      item('i1', { priceLevelId: 'vip' }),
      item('i2', { priceLevelId: 'old-vip' }),
    ] as never);
    expect(states.get('i1')).toEqual({ skip: null, current: 5000 });
    expect(states.get('i2')).toEqual({
      skip: ServicePriceChangeSkip.LEVEL_IS_DEFAULT,
      current: null,
    });
  });
});
