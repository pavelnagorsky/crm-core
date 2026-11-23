import { PriceRuleTargetType } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { bookingCatalogSnapshot } from '../testing/booking-catalog-snapshot.factory.js';
import { PriceRuleCatalogService } from './price-rule-catalog.service.js';

const { SERVICE, SERVICE_CATEGORY, BUNDLE } = PriceRuleTargetType;
const ref = (type: PriceRuleTargetType, id: string) => ({
  type,
  id,
  excluded: false,
});

describe('PriceRuleCatalogService', () => {
  const catalog = {
    findServicePriceEntries: vi.fn(),
    findCategoryNames: vi.fn(),
    findBundleTitlesInLocation: vi.fn(),
    loadCatalogSnapshot: vi.fn(),
  };
  const service = new PriceRuleCatalogService(catalog as never);

  beforeEach(() => {
    vi.resetAllMocks();
    catalog.findServicePriceEntries.mockResolvedValue([
      { id: 'cut', title: 'Cut', price: '50.00' },
    ]);
    catalog.findCategoryNames.mockResolvedValue(new Map([['hair', 'Hair']]));
    catalog.findBundleTitlesInLocation.mockResolvedValue(
      new Map([['combo', 'Combo']]),
    );
  });

  it('asks the catalog for each kind of target of the location', async () => {
    await service.targetNames('location', [
      ref(SERVICE, 'cut'),
      ref(SERVICE, 'cut'),
      ref(SERVICE_CATEGORY, 'hair'),
      ref(BUNDLE, 'combo'),
    ]);
    expect(catalog.findServicePriceEntries).toHaveBeenCalledWith('location', [
      'cut',
    ]);
    expect(catalog.findCategoryNames).toHaveBeenCalledWith('location', [
      'hair',
    ]);
    expect(catalog.findBundleTitlesInLocation).toHaveBeenCalledWith(
      'location',
      ['combo'],
    );
  });

  it('names targets by type and id; an id of another type is another target', async () => {
    const names = await service.targetNames('location', [
      ref(SERVICE, 'cut'),
      ref(SERVICE_CATEGORY, 'hair'),
      ref(BUNDLE, 'combo'),
      ref(BUNDLE, 'cut'),
    ]);
    expect(names.get('SERVICE:cut')).toBe('Cut');
    expect(names.get('SERVICE_CATEGORY:hair')).toBe('Hair');
    expect(names.get('BUNDLE:combo')).toBe('Combo');
    expect(names.has('BUNDLE:cut')).toBe(false);
  });

  it('accepts targets that all exist in the location', async () => {
    await expect(
      service.assertTargetsInLocation('location', [
        ref(SERVICE, 'cut'),
        ref(BUNDLE, 'combo'),
      ]),
    ).resolves.toBeUndefined();
  });

  it.each([
    [ref(SERVICE, 'foreign')],
    [ref(SERVICE_CATEGORY, 'foreign')],
    [ref(BUNDLE, 'foreign')],
    [ref(BUNDLE, 'cut')],
  ])('rejects the target %j that is not in the location', async (target) => {
    await expect(
      service.assertTargetsInLocation('location', [
        ref(SERVICE, 'cut'),
        target,
      ]),
    ).rejects.toMatchObject({
      errorCode: 'PRICE_RULE_INVALID',
      status: 400,
      payload: { field: 'targets' },
    });
  });

  it('does not touch the catalog when there are no targets', async () => {
    await service.assertTargetsInLocation('location', []);
    expect(catalog.findServicePriceEntries).not.toHaveBeenCalled();
  });

  it('names targets with null for the ones that are gone', async () => {
    expect(
      await service.nameTargets('location', [
        ref(SERVICE, 'cut'),
        ref(SERVICE, 'gone'),
      ]),
    ).toEqual([
      { type: 'SERVICE', id: 'cut', excluded: false, name: 'Cut' },
      { type: 'SERVICE', id: 'gone', excluded: false, name: null },
    ]);
  });

  it('builds the coverage from the cached catalog snapshot', async () => {
    const snapshot = bookingCatalogSnapshot();
    snapshot.services[0].categoryId = 'hair';
    catalog.loadCatalogSnapshot.mockResolvedValue(snapshot);
    const coverage = await service.loadCoverage('location');
    expect(catalog.loadCatalogSnapshot).toHaveBeenCalledWith(
      'location',
      ReadConsistency.CACHED,
    );
    expect(coverage.services).toEqual([
      { id: 'cut', categoryId: 'hair' },
      { id: 'color', categoryId: null },
    ]);
    expect(coverage.bundles).toContainEqual({
      id: 'sum-bundle',
      serviceIds: ['cut', 'color'],
    });
  });
});
