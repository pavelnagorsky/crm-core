import { StaffInterval } from './interfaces/staff-interval.interface.js';

export function hasStaffOverlap(items: readonly StaffInterval[]): boolean {
  return items.some((item, index) =>
    items
      .slice(index + 1)
      .some(
        (other) =>
          item.staffId === other.staffId &&
          item.startAt < other.endAt &&
          other.startAt < item.endAt,
      ),
  );
}
