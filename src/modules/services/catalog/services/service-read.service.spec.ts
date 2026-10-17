import { ServiceResponseDto } from '../dto/service-response.dto.js';
import { ServiceReadService } from './service-read.service.js';

describe('ServiceReadService.findIdsByFilter', () => {
  const findMany = vi.fn();
  const service = new ServiceReadService({ service: { findMany } } as never);

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('matches title, description and category text', async () => {
    await service.findIdsByFilter('business-1', { search: '  окрашивание  ' });

    expect(findMany.mock.calls[0][0].where).toEqual({
      locationId: 'business-1',
      OR: [
        { title: { contains: 'окрашивание', mode: 'insensitive' } },
        { description: { contains: 'окрашивание', mode: 'insensitive' } },
        {
          category: { name: { contains: 'окрашивание', mode: 'insensitive' } },
        },
        {
          category: {
            description: { contains: 'окрашивание', mode: 'insensitive' },
          },
        },
      ],
    });
  });
});

describe('ServiceResponseDto', () => {
  it('flags a service that no staff member owns', () => {
    const items = [
      {
        id: 'owned',
        imageFile: null,
        price: 100,
        _count: { staffServices: 2 },
      },
      {
        id: 'unowned',
        imageFile: null,
        price: 100,
        _count: { staffServices: 0 },
      },
    ];

    expect(
      items.map(
        (item) => ServiceResponseDto.fromEntity(item as never).hasNoStaff,
      ),
    ).toEqual([false, true]);
  });
});

describe('ServiceReadService.resolveCatalogEntries', () => {
  const findMany = vi.fn();
  const service = new ServiceReadService({ service: { findMany } } as never);

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it('loads only selected catalog entries in the caller transaction', async () => {
    await service.resolveCatalogEntries('business-1', ['selected'], {
      service: { findMany },
    } as never);

    expect(findMany.mock.calls[0][0].where).toEqual({
      locationId: 'business-1',
      id: { in: ['selected'] },
    });
    expect(findMany.mock.calls[0][0].include).toEqual({
      imageFile: true,
      category: { select: { name: true } },
      _count: { select: { staffServices: true } },
    });
  });
});
