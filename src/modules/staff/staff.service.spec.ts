import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { StaffService } from './staff.service.js';
import { StaffSearchRequestDto } from './dto/staff-search-request.dto.js';
import { StaffResponseDto } from './dto/staff-response.dto.js';

describe('StaffService.search', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const service = new StaffService(
    {
      staff: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    } as never,
    { emit: vi.fn() } as unknown as EventEmitter2,
    {} as ConfigService,
    {} as never,
  );

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('flags a staff member who owns no services', async () => {
    findMany.mockResolvedValue([
      {
        id: 'with-services',
        avatarFile: null,
        status: 'ACTIVE',
        _count: { staffServices: 1 },
        staffServices: [{ serviceId: 'service-1' }],
      },
      {
        id: 'without-services',
        avatarFile: null,
        status: 'ACTIVE',
        _count: { staffServices: 0 },
        staffServices: [],
      },
    ]);

    const { items } = await service.search('business-1', {
      page: 1,
      pageSize: 25,
    } as StaffSearchRequestDto);

    expect(findMany.mock.calls[0][0].include).toEqual({
      avatarFile: true,
      _count: { select: { staffServices: true } },
      staffServices: { select: { serviceId: true } },
    });
    const responses = items.map(StaffResponseDto.fromEntity);
    expect(responses.map((item) => item.hasNoServices)).toEqual([false, true]);
    expect(responses.map((item) => item.serviceIds)).toEqual([
      ['service-1'],
      [],
    ]);
  });
});
