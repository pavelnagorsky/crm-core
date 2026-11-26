import { PriceRuleTargetType } from '@prisma/client';
import { PriceRuleCatalogCoverage } from '../interfaces/price-rule-catalog-coverage.interface.js';
import { affectedServiceCount } from './price-rule-coverage.rules.js';

const { SERVICE, SERVICE_CATEGORY, BUNDLE } = PriceRuleTargetType;

const catalog: PriceRuleCatalogCoverage = {
  services: [
    { id: 'cut', categoryId: 'hair' },
    { id: 'color', categoryId: 'hair' },
    { id: 'nails', categoryId: 'nails' },
    { id: 'spa', categoryId: null },
  ],
  bundles: [{ id: 'combo', serviceIds: ['cut', 'nails'] }],
};

const target = (type: PriceRuleTargetType, id: string, excluded = false) => ({
  type,
  id,
  excluded,
});

describe('affectedServiceCount', () => {
  it('counts every service for a rule that applies to all', () => {
    expect(
      affectedServiceCount({ appliesToAllServices: true, targets: [] }, catalog),
    ).toBe(4);
  });

  it('takes excluded services and categories out', () => {
    expect(
      affectedServiceCount(
        {
          appliesToAllServices: true,
          targets: [
            target(SERVICE, 'spa', true),
            target(SERVICE_CATEGORY, 'hair', true),
          ],
        },
        catalog,
      ),
    ).toBe(1);
  });

  it('does not take the services of an excluded bundle out', () => {
    expect(
      affectedServiceCount(
        { appliesToAllServices: true, targets: [target(BUNDLE, 'combo', true)] },
        catalog,
      ),
    ).toBe(4);
  });

  it('counts listed services, category services and bundle services once', () => {
    expect(
      affectedServiceCount(
        {
          appliesToAllServices: false,
          targets: [
            target(SERVICE, 'cut'),
            target(SERVICE_CATEGORY, 'hair'),
            target(BUNDLE, 'combo'),
          ],
        },
        catalog,
      ),
    ).toBe(3);
  });

  it('ignores targets the catalog no longer has', () => {
    expect(
      affectedServiceCount(
        {
          appliesToAllServices: false,
          targets: [target(SERVICE, 'gone'), target(BUNDLE, 'gone-bundle')],
        },
        catalog,
      ),
    ).toBe(0);
  });

  it('counts nothing for a rule whose targets were all removed', () => {
    expect(
      affectedServiceCount({ appliesToAllServices: false, targets: [] }, catalog),
    ).toBe(0);
  });
});
