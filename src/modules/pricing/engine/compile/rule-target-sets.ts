import { PriceRuleTargetType } from '../enums/price-rule-target-type.enum.js';
import { RuleTargetContext } from './interfaces/rule-target-context.interface.js';

/** Target ids of one kind (included or excluded) by target type. */
export class RuleTargetSets {
  private readonly services = new Set<string>();
  private readonly categories = new Set<string>();
  private readonly bundles = new Set<string>();

  add(type: PriceRuleTargetType, id: string): void {
    if (type === PriceRuleTargetType.SERVICE) this.services.add(id);
    else if (type === PriceRuleTargetType.SERVICE_CATEGORY)
      this.categories.add(id);
    else this.bundles.add(id);
  }

  has(context: RuleTargetContext): boolean {
    return (
      (context.serviceId !== null && this.services.has(context.serviceId)) ||
      (context.categoryId !== null &&
        this.categories.has(context.categoryId)) ||
      (context.bundleId !== null && this.bundles.has(context.bundleId))
    );
  }
}
