import { ServiceBundleService } from './service-bundle.service.js';

describe('ServiceBundleService', () => {
  const findMany = vi.fn();
  const service = new ServiceBundleService(
    { serviceBundle: { findMany } } as never,
    { emit: vi.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('catalog search loads only selected catalog entries in the caller transaction', async () => {
    await service.resolveCatalogEntries('business-1', ['selected'], {
      serviceBundle: { findMany },
    } as never);

    expect(findMany.mock.calls[0][0].where).toEqual({
      locationId: 'business-1',
      id: { in: ['selected'] },
    });
    expect(findMany.mock.calls[0][0].include.category).toEqual({
      select: { name: true },
    });
    expect(
      findMany.mock.calls[0][0].include.items.include.service.select,
    ).toEqual({
      title: true,
      price: true,
      durationMinutes: true,
      bufferMinutes: true,
    });
  });
});
