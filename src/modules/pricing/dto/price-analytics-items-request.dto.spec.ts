import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PriceAnalyticsItemsRequestDto } from './price-analytics-items-request.dto.js';

const parse = (query: Record<string, string>) => {
  const dto = plainToInstance(PriceAnalyticsItemsRequestDto, query, {
    enableImplicitConversion: false,
  });
  return {
    dto,
    errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
      (error) => error.property,
    ),
  };
};

describe('PriceAnalyticsItemsRequestDto', () => {
  it('takes the range, the filters and the page with defaults', () => {
    const { dto, errors } = parse({
      period: 'CUSTOM',
      from: '2026-11-01',
      to: '2026-11-30',
      reason: 'PROMOTION',
      ruleId: '7f1c1d3e-8c5a-4f43-9a55-1c1f7b0b2a11',
      staffId: 'none',
      itemType: 'PRODUCT',
      page: '2',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ page: 2, pageSize: 25, staffId: 'none' });
  });

  it('rejects a bad period, reason, staff id and page', () => {
    const { errors } = parse({
      period: 'WEEK',
      reason: 'GIFT',
      staffId: 'someone',
      itemType: 'BUNDLE',
      page: '0',
    });
    expect(errors.sort()).toEqual(['itemType', 'page', 'period', 'reason', 'staffId']);
  });

  it('takes a page size up to 100 and rejects a larger or empty one', () => {
    expect(parse({ period: 'LAST_30D', pageSize: '100' }).errors).toEqual([]);
    expect(parse({ period: 'LAST_30D', pageSize: '101' }).errors).toEqual(['pageSize']);
    expect(parse({ period: 'LAST_30D', pageSize: '0' }).errors).toEqual(['pageSize']);
  });

  it('accepts a staff uuid', () => {
    const { errors } = parse({
      period: 'LAST_30D',
      staffId: '7f1c1d3e-8c5a-4f43-9a55-1c1f7b0b2a11',
    });
    expect(errors).toEqual([]);
  });
});
