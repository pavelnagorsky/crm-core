import { AnyStaffRule } from '@prisma/client';
import { StaffRankCandidate } from '../interfaces/staff-rank-candidate.interface.js';

type Compare = (a: StaffRankCandidate, b: StaffRankCandidate) => number;

const byPrice: Compare = (a, b) => a.price - b.price;
const byLoad: Compare = (a, b) => a.dayLoad - b.dayLoad;
const byLastAssigned: Compare = (a, b) =>
  (a.lastAssignedAt ?? -Infinity) - (b.lastAssignedAt ?? -Infinity);

/** Order of each "any staff" rule (docs/pricing-stage2-api.md). */
const RULE_ORDER: Record<AnyStaffRule, Compare[]> = {
  [AnyStaffRule.CHEAPER_AND_FREER]: [byPrice, byLoad],
  [AnyStaffRule.LESS_LOADED]: [byLoad, byPrice],
  [AnyStaffRule.PRICIER]: [(a, b) => b.price - a.price, byLoad],
  [AnyStaffRule.ROUND_ROBIN]: [byLastAssigned, byLoad],
};

/**
 * Staff ids of one booking item in the order they are offered: free before busy, the
 * preferred staff member first, then the location rule, then id so the order is total.
 * Slots and booking creation both rank with this function, so a slot shows the price
 * of the staff member the booking will get.
 */
export function rankStaff(
  candidates: readonly StaffRankCandidate[],
  rule: AnyStaffRule,
  preferredStaffId?: string,
): string[] {
  const preferred = (id: string) => (id === preferredStaffId ? 0 : 1);
  const order = RULE_ORDER[rule];
  return [...candidates]
    .sort((a, b) => {
      const head =
        Number(a.busy) - Number(b.busy) || preferred(a.id) - preferred(b.id);
      if (head !== 0) return head;
      for (const compare of order) {
        const result = compare(a, b);
        if (result !== 0) return result;
      }
      return a.id.localeCompare(b.id);
    })
    .map((candidate) => candidate.id);
}
