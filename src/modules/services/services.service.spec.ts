import { EventEmitter2 } from '@nestjs/event-emitter';
import { LocationService } from '../location/services/location.service.js';
import { ServiceResponseDto } from './dto/service-response.dto.js';
import { ServicesService } from './services.service.js';

describe('ServicesService.findIdsByFilter', () => {
  const findMany = vi.fn();
  const service = new ServicesService(
    { service: { findMany } } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
    {} as LocationService,
  );

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

describe('ServicesService.resolveCatalogEntries', () => {
  const findMany = vi.fn();
  const service = new ServicesService(
    { service: { findMany } } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
    {} as LocationService,
  );

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
