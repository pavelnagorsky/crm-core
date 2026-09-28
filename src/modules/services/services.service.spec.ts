import { EventEmitter2 } from '@nestjs/event-emitter';
import { ServicesService } from './services.service.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { BusinessService } from '../business/business.service.js';

describe('ServicesService.search', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const service = new ServicesService(
    {
      service: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
    {} as BusinessService,
  );

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('matches title, description and category text', async () => {
    await service.search('business-1', {
      page: 1,
      pageSize: 25,
      search: '  окрашивание  ',
    } as ServiceSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'business-1',
      OR: [
        { title: { contains: 'окрашивание', mode: 'insensitive' } },
        { description: { contains: 'окрашивание', mode: 'insensitive' } },
        { category: { name: { contains: 'окрашивание', mode: 'insensitive' } } },
        { category: { description: { contains: 'окрашивание', mode: 'insensitive' } } },
      ],
    });
  });
});
