import { RuleTargetKind } from '../enums/rule-target-kind.enum.js';
import { RuleTargetContext } from './interfaces/rule-target-context.interface.js';

/** A service line, a SUM bundle line (with its bundle) or a FIXED bundle (bundle only). */
export function serviceTargetContext(
  serviceId: string | null,
  categoryId: string | null,
  bundleId: string | null,
): RuleTargetContext {
  return {
    kind: RuleTargetKind.SERVICE,
    serviceId,
    categoryId,
    bundleId,
    productId: null,
    productCategoryId: null,
  };
}

/** A product line: the brand product and its product category. */
export function productTargetContext(
  productId: string,
  productCategoryId: string | null,
): RuleTargetContext {
  return {
    kind: RuleTargetKind.PRODUCT,
    serviceId: null,
    categoryId: null,
    bundleId: null,
    productId,
    productCategoryId,
  };
}
