import { PriceRuleTargetType } from '@prisma/client';
import { ProductCatalogItemKind } from '../../products/enums/product-catalog-item-kind.enum.js';
import { CatalogItemKind } from '../../services/enums/catalog-item-kind.enum.js';
import { PriceRuleTargetCleanupListener } from './price-rule-target-cleanup.listener.js';

describe('PriceRuleTargetCleanupListener', () => {
  const rules = { removeTargets: vi.fn(), removeBrandTargets: vi.fn() };
  const listener = new PriceRuleTargetCleanupListener(rules as never);

  beforeEach(() => vi.resetAllMocks());

  it.each([
    [CatalogItemKind.SERVICE, PriceRuleTargetType.SERVICE],
    [CatalogItemKind.CATEGORY, PriceRuleTargetType.SERVICE_CATEGORY],
    [CatalogItemKind.BUNDLE, PriceRuleTargetType.BUNDLE],
  ])('removes the targets of a deleted %s as %s', async (kind, targetType) => {
    await listener.onCatalogItemRemoved({
      locationId: 'location',
      kind,
      id: 'item-1',
    });
    expect(rules.removeTargets).toHaveBeenCalledWith(
      'location',
      targetType,
      'item-1',
    );
  });

  it.each([
    [ProductCatalogItemKind.PRODUCT, PriceRuleTargetType.PRODUCT],
    [ProductCatalogItemKind.CATEGORY, PriceRuleTargetType.PRODUCT_CATEGORY],
  ])(
    'removes the targets of a deleted product %s as %s in every location of the brand',
    async (kind, targetType) => {
      await listener.onProductCatalogItemRemoved({
        brandId: 'brand',
        kind,
        id: 'item-1',
      });
      expect(rules.removeBrandTargets).toHaveBeenCalledWith(
        'brand',
        targetType,
        'item-1',
      );
      expect(rules.removeTargets).not.toHaveBeenCalled();
    },
  );
});
