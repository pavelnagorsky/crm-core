import { ServiceBundleService } from './service-bundle.service.js';

describe('ServiceBundleService', () => {
  const findMany = vi.fn();
  const service = new ServiceBundleService({
    serviceBundle: { findMany },
  } as never);

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('catalog search matches title and description only', async () => {
    await service.listForCatalog('business-1', { search: '  комплекс  ' });

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'business-1',
      OR: [
        { title: { contains: 'комплекс', mode: 'insensitive' } },
        { description: { contains: 'комплекс', mode: 'insensitive' } },
      ],
    });
    expect(findMany.mock.calls[0][0].include.category).toEqual({ select: { name: true } });
    expect(findMany.mock.calls[0][0].include.items.include.service.select).toEqual({
      title: true,
      price: true,
      durationMinutes: true,
      bufferMinutes: true,
    });
  });
});
