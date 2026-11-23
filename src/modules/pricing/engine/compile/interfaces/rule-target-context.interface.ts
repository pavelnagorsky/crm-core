/**
 * What a rule target is matched against. A separate service or a SUM bundle line carries its
 * service and category; a FIXED bundle is one package and carries only the bundle.
 */
export interface RuleTargetContext {
  serviceId: string | null;
  categoryId: string | null;
  bundleId: string | null;
}
