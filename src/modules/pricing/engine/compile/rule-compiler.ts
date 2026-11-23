import { PricingRuleEntry } from '../interfaces/pricing-rule-entry.interface.js';
import { CompiledRule } from './compiled-rule.js';
import { CompiledRuleSet } from './compiled-rule-set.js';

/** Turns snapshot rules into indexed checks once per PriceBook (docs/pricing-plan.md 3.2). */
export class RuleCompiler {
  private constructor() {}

  static compile(entries: readonly PricingRuleEntry[]): CompiledRuleSet {
    const rules = [...entries]
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0
          : a.createdAt < b.createdAt
            ? -1
            : 1,
      )
      .map((entry) => new CompiledRule(entry));
    return new CompiledRuleSet(rules);
  }
}
