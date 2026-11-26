import { PriceRuleTargetType } from '../enums/price-rule-target-type.enum.js';
import { RuleTargetKind } from '../enums/rule-target-kind.enum.js';
import { RuleTargetContext } from './interfaces/rule-target-context.interface.js';

/** Target ids of one kind (included or excluded) by target type. */
export class RuleTargetSets {
  private readonly services = new Set<string>();
  private readonly categories = new Set<string>();
  private readonly bundles = new Set<string>();
  private readonly products = new Set<string>();
  private readonly productCategories = new Set<string>();

  add(type: PriceRuleTargetType, id: string): void {
    switch (type) {
      case PriceRuleTargetType.SERVICE:
        this.services.add(id);
        return;
      case PriceRuleTargetType.SERVICE_CATEGORY:
        this.categories.add(id);
        return;
      case PriceRuleTargetType.BUNDLE:
        this.bundles.add(id);
        return;
      case PriceRuleTargetType.PRODUCT:
        this.products.add(id);
        return;
      case PriceRuleTargetType.PRODUCT_CATEGORY:
        this.productCategories.add(id);
        return;
      default:
        throw new RangeError(`Unknown rule target type ${String(type)}`);
    }
  }

  /** True when the sets hold a target of the context's kind. */
  has(context: RuleTargetContext): boolean {
    if (context.kind === RuleTargetKind.PRODUCT)
      return (
        (context.productId !== null && this.products.has(context.productId)) ||
        (context.productCategoryId !== null &&
          this.productCategories.has(context.productCategoryId))
      );
    return (
      (context.serviceId !== null && this.services.has(context.serviceId)) ||
      (context.categoryId !== null &&
        this.categories.has(context.categoryId)) ||
      (context.bundleId !== null && this.bundles.has(context.bundleId))
    );
  }

  /** Some target of this kind is in the sets. */
  hasKind(kind: RuleTargetKind): boolean {
    return kind === RuleTargetKind.PRODUCT
      ? this.products.size > 0 || this.productCategories.size > 0
      : this.services.size > 0 ||
          this.categories.size > 0 ||
          this.bundles.size > 0;
  }
}
