import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PriceRuleTargetType } from '@prisma/client';
import { CATALOG_ITEM_REMOVED_EVENT } from '../../services/constants/catalog-events.constants.js';
import { CatalogItemKind } from '../../services/enums/catalog-item-kind.enum.js';
import type { CatalogItemRemovedEvent } from '../../services/interfaces/catalog-item-removed-event.interface.js';
import { PriceRulesService } from '../services/price-rules.service.js';

const TARGET_TYPE_OF_KIND: Record<CatalogItemKind, PriceRuleTargetType> = {
  [CatalogItemKind.SERVICE]: PriceRuleTargetType.SERVICE,
  [CatalogItemKind.CATEGORY]: PriceRuleTargetType.SERVICE_CATEGORY,
  [CatalogItemKind.BUNDLE]: PriceRuleTargetType.BUNDLE,
};

/**
 * The catalog module announces deleted services, categories and bundles; the rules that
 * targeted them lose those targets (the rules stay). The services module does not know pricing.
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
}
