import { PriceRuleTargetType } from '../enums/price-rule-target-type.enum.js';
import { RuleTargetKind } from '../enums/rule-target-kind.enum.js';
import {
  productTargetContext,
  serviceTargetContext,
} from './rule-target-contexts.js';
import { RuleTargetSets } from './rule-target-sets.js';

describe('RuleTargetSets', () => {
  it('throws on an unknown target type instead of filing it under bundles', () => {
    const sets = new RuleTargetSets();
    expect(() =>
      sets.add('UNKNOWN' as PriceRuleTargetType, 'x'),
    ).toThrow(RangeError);
    expect(sets.hasKind(RuleTargetKind.SERVICE)).toBe(false);
  });

  it('keeps products apart from services with the same id', () => {
    const sets = new RuleTargetSets();
    sets.add(PriceRuleTargetType.PRODUCT, 'x');
    sets.add(PriceRuleTargetType.SERVICE_CATEGORY, 'care');
    expect(sets.has(productTargetContext('x', null))).toBe(true);
    expect(sets.has(serviceTargetContext('x', null, null))).toBe(false);
    expect(sets.has(productTargetContext('y', 'care'))).toBe(false);
    expect(sets.hasKind(RuleTargetKind.PRODUCT)).toBe(true);
  });

  it('matches a product by its product category', () => {
    const sets = new RuleTargetSets();
    sets.add(PriceRuleTargetType.PRODUCT_CATEGORY, 'care');
    expect(sets.has(productTargetContext('shampoo', 'care'))).toBe(true);
    expect(sets.hasKind(RuleTargetKind.SERVICE)).toBe(false);
  });
});
