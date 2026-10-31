import { StaffAssignmentCandidates } from './interfaces/staff-assignment-candidates.interface.js';

/** Finds a complete team, preserving candidate preference order where possible. */
export function assignStaff(
  items: readonly StaffAssignmentCandidates[],
  distinct: boolean,
): Map<string, string> | null {
  if (items.some((item) => item.staffIds.length === 0)) return null;
  if (!distinct)
    return new Map(items.map((item) => [item.itemId, item.staffIds[0]]));

  const ordered = [...items].sort(
    (a, b) => a.staffIds.length - b.staffIds.length,
  );
  const ownerByStaff = new Map<string, StaffAssignmentCandidates>();
  const place = (
    item: StaffAssignmentCandidates,
    visited: Set<string>,
  ): boolean => {
    for (const staffId of item.staffIds) {
      if (!visited.has(staffId) && !ownerByStaff.has(staffId)) {
        ownerByStaff.set(staffId, item);
        return true;
      }
    }
    for (const staffId of item.staffIds) {
      if (visited.has(staffId)) continue;
      visited.add(staffId);
      const owner = ownerByStaff.get(staffId);
      if (!owner || place(owner, visited)) {
        ownerByStaff.set(staffId, item);
        return true;
      }
    }
    return false;
  };
  for (const item of ordered) {
    if (!place(item, new Set())) return null;
  }
  return new Map(
    [...ownerByStaff].map(([staffId, item]) => [item.itemId, staffId]),
  );
}
