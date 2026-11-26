import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PriceRuleTargetType } from '@prisma/client';
import { PRODUCT_CATALOG_ITEM_REMOVED_EVENT } from '../../products/constants/product-catalog-events.constants.js';
import { ProductCatalogItemKind } from '../../products/enums/product-catalog-item-kind.enum.js';
import type { ProductCatalogItemRemovedEvent } from '../../products/interfaces/product-catalog-item-removed-event.interface.js';
import { CATALOG_ITEM_REMOVED_EVENT } from '../../services/constants/catalog-events.constants.js';
import { CatalogItemKind } from '../../services/enums/catalog-item-kind.enum.js';
import type { CatalogItemRemovedEvent } from '../../services/interfaces/catalog-item-removed-event.interface.js';
import { PriceRulesService } from '../services/price-rules.service.js';

const TARGET_TYPE_OF_KIND: Record<CatalogItemKind, PriceRuleTargetType> = {
  [CatalogItemKind.SERVICE]: PriceRuleTargetType.SERVICE,
  [CatalogItemKind.CATEGORY]: PriceRuleTargetType.SERVICE_CATEGORY,
  [CatalogItemKind.BUNDLE]: PriceRuleTargetType.BUNDLE,
};

const TARGET_TYPE_OF_PRODUCT_KIND: Record<
  ProductCatalogItemKind,
  PriceRuleTargetType
> = {
  [ProductCatalogItemKind.PRODUCT]: PriceRuleTargetType.PRODUCT,
  [ProductCatalogItemKind.CATEGORY]: PriceRuleTargetType.PRODUCT_CATEGORY,
};

/**
 * The catalog module announces deleted services, categories and bundles of a location, the
 * products module deleted products and product categories of a brand; the rules that
 * targeted them lose those targets (the rules stay). Neither module knows pricing.
 */
@Injectable()
export class PriceRuleTargetCleanupListener {
  constructor(private readonly rules: PriceRulesService) {}

  @OnEvent(CATALOG_ITEM_REMOVED_EVENT)
  async onCatalogItemRemoved(event: CatalogItemRemovedEvent): Promise<void> {
    await this.rules.removeTargets(
      event.locationId,
      TARGET_TYPE_OF_KIND[event.kind],
      event.id,
    );
  }

  /** Products are brand-wide: targets go in every location of the brand. */
  @OnEvent(PRODUCT_CATALOG_ITEM_REMOVED_EVENT)
  async onProductCatalogItemRemoved(
    event: ProductCatalogItemRemovedEvent,
  ): Promise<void> {
    await this.rules.removeBrandTargets(
      event.brandId,
      TARGET_TYPE_OF_PRODUCT_KIND[event.kind],
      event.id,
    );
  }
}
