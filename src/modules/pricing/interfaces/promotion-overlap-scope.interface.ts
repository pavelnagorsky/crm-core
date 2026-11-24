import { RuleTargetContext } from '../engine/compile/interfaces/rule-target-context.interface.js';

/** A service or bundle of the catalog with its title, where two promotions may meet. */
export interface PromotionOverlapScope {
  context: RuleTargetContext;
  title: string;
}
