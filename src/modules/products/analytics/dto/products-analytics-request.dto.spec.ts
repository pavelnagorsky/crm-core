import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DashboardPeriod } from '../../../dashboard/enums/dashboard-period.enum.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsRequestDto } from './products-analytics-request.dto.js';

describe('ProductsAnalyticsRequestDto location filter', () => {
  const locationId = '11111111-1111-4111-8111-111111111111';
  const validateLocations = (locationIds: unknown) =>
    validate(
      plainToInstance(ProductsAnalyticsRequestDto, {
        period: DashboardPeriod.LAST_7D,
        keys: [ProductsAnalyticsWidgetKey.GROSS_PROFIT],
        locationIds,
      }),
    );

  it('accepts an omitted filter or a nonempty UUID list', async () => {
    expect(await validateLocations(undefined)).toEqual([]);
    expect(await validateLocations([locationId])).toEqual([]);
  });

  it.each([
    { value: null },
    { value: [] },
    { value: [locationId, locationId] },
    { value: ['not-a-uuid'] },
    { value: locationId },
  ])('rejects invalid selections: $value', async ({ value }) => {
    expect(await validateLocations(value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'locationIds' }),
      ]),
    );
  });
});
