import { RuleTargetKind } from '../../enums/rule-target-kind.enum.js';

/**
 * What a rule target is matched against. A separate service or a SUM bundle line carries its
 * service and category; a FIXED bundle is one package and carries only the bundle. A product
 * line carries the brand product and its product category.
 */
export interface RuleTargetContext {
  kind: RuleTargetKind;
  serviceId: string | null;
  categoryId: string | null;
  bundleId: string | null;
  productId: string | null;
  productCategoryId: string | null;
}
