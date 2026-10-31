import { assignStaff } from './assign-staff.js';
import { normalizeStaffAssignments } from './normalize-staff-assignments.js';

describe('Complete staff assignment', () => {
  it('reassigns along an augmenting path when the first choices exhaust a constrained service', () => {
    const items = [
      { itemId: 'a', staffIds: ['x', 'y'] },
      { itemId: 'b', staffIds: ['x', 'z'] },
      { itemId: 'c', staffIds: ['x', 'z'] },
    ];
    const result = assignStaff(items, true)!;
    expect(result.get('a')).toBe('y');
    expect(new Set(result.values()).size).toBe(3);
    for (const item of items)
      expect(item.staffIds).toContain(result.get(item.itemId));
  });

  it('rejects ten services competing for nine staff without enumerating permutations', () => {
    const staffIds = Array.from({ length: 9 }, (_, index) => String(index));
    expect(
      assignStaff(
        Array.from({ length: 10 }, (_, index) => ({
          itemId: String(index),
          staffIds,
        })),
        true,
      ),
    ).toBeNull();
  });

  it('allows the same preferred master on sequential services', () => {
    expect([
      ...assignStaff(
        [
          { itemId: 'a', staffIds: ['x', 'y'] },
          { itemId: 'b', staffIds: ['x'] },
        ],
        false,
      )!.values(),
    ]).toEqual(['x', 'x']);
  });

  it('rejects ambiguous global and per-service choices, keeping legacy item overrides', () => {
    expect(() =>
      normalizeStaffAssignments(['a'], 'SEQUENTIAL', 'x', [
        { serviceId: 'a', staffId: 'y' },
      ]),
    ).toThrow(
      expect.objectContaining({
        errorCode: 'BOOKING_STAFF_ASSIGNMENT_CONFLICT',
      }),
    );
    expect(() =>
      normalizeStaffAssignments(
        ['a'],
        'SEQUENTIAL',
        'x',
        [],
        [{ serviceId: 'a', staffId: 'y' }],
      ),
    ).not.toThrow();
  });
});
