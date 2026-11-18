import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientLookupRequestDto } from './client-lookup-request.dto.js';

async function check(query: Record<string, unknown>) {
  const dto = plainToInstance(ClientLookupRequestDto, query);
  const errors = await validate(dto, { whitelist: true });
  return { dto, properties: errors.map((error) => error.property) };
}

describe('ClientLookupRequestDto', () => {
  it('finds by phone with a short default page', async () => {
    const { dto, properties } = await check({ phone: '+375 (29) 233' });
    expect(properties).toEqual([]);
    expect(dto.phone).toBe('37529233');
    expect(dto.pageSize).toBe(6);
  });

  it('finds by a search term', async () => {
    expect((await check({ search: 'Анна' })).properties).toEqual([]);
  });

  it.each([{}, { phone: '' }, { search: '   ' }, { phone: ' ', search: '' }])(
    'requires a phone or a search term: %o',
    async (query) => {
      expect((await check(query)).properties).toContain('search');
    },
  );

  it.each([
    [{ phone: '29233', pageSize: '21' }, 'pageSize'],
    [{ phone: '29233', isExport: 'true' }, 'isExport'],
    [{ phone: '29233', orderBy: 'createdAt' }, 'orderBy'],
    [{ phone: '802' }, 'phone'],
  ])('rejects %o', async (query, property) => {
    expect((await check(query)).properties).toContain(property);
  });

  it('accepts the largest page', async () => {
    expect(
      (await check({ phone: '29233', pageSize: '20' })).properties,
    ).toEqual([]);
  });
});
