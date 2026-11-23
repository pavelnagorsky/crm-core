import { AnyStaffRule } from '@prisma/client';
import { StaffRankCandidate } from '../interfaces/staff-rank-candidate.interface.js';
import { rankStaff } from './staff-ranking.rules.js';

function candidate(
  id: string,
  options: Partial<Omit<StaffRankCandidate, 'id'>> = {},
): StaffRankCandidate {
  return {
    id,
    busy: false,
    price: 5000,
    dayLoad: 0,
    lastAssignedAt: null,
    ...options,
  };
}

describe('rankStaff', () => {
  describe.each([
    [
      'CHEAPER_AND_FREER: price ascending, then load',
      AnyStaffRule.CHEAPER_AND_FREER,
      [
        candidate('a', { price: 8000, dayLoad: 0 }),
        candidate('b', { price: 5000, dayLoad: 3 }),
        candidate('c', { price: 5000, dayLoad: 1 }),
        candidate('d', { price: 6000, dayLoad: 0 }),
      ],
      ['c', 'b', 'd', 'a'],
    ],
    [
      'LESS_LOADED: load ascending, then price ascending',
      AnyStaffRule.LESS_LOADED,
      [
        candidate('a', { price: 8000, dayLoad: 0 }),
        candidate('b', { price: 5000, dayLoad: 3 }),
        candidate('c', { price: 4000, dayLoad: 0 }),
        candidate('d', { price: 6000, dayLoad: 1 }),
      ],
      ['c', 'a', 'd', 'b'],
    ],
    [
      'PRICIER: price descending, then load',
      AnyStaffRule.PRICIER,
      [
        candidate('a', { price: 5000, dayLoad: 0 }),
        candidate('b', { price: 8000, dayLoad: 3 }),
        candidate('c', { price: 8000, dayLoad: 1 }),
        candidate('d', { price: 6000, dayLoad: 0 }),
      ],
      ['c', 'b', 'd', 'a'],
    ],
    [
      'ROUND_ROBIN: longest without a booking first, then load',
      AnyStaffRule.ROUND_ROBIN,
      [
        candidate('a', { lastAssignedAt: 3000 }),
        candidate('b', { lastAssignedAt: 1000, dayLoad: 2 }),
        candidate('c', { lastAssignedAt: 1000, dayLoad: 1 }),
        candidate('d', { lastAssignedAt: 2000 }),
      ],
      ['c', 'b', 'd', 'a'],
    ],
  ])('%s', (_name, rule, candidates, expected) => {
    it('orders the candidates', () => {
      expect(rankStaff(candidates, rule)).toEqual(expected);
    });

    it('does not depend on the input order', () => {
      expect(rankStaff([...candidates].reverse(), rule)).toEqual(expected);
    });
  });

  describe.each(Object.values(AnyStaffRule))('%s', (rule) => {
    it('puts free staff before busy staff whatever the rule prefers', () => {
      const ranked = rankStaff(
        [
          candidate('busy-best', {
            busy: true,
            price: 1,
            dayLoad: 0,
            lastAssignedAt: 1,
          }),
          candidate('free-worst', {
            price: 9_999_999,
            dayLoad: 99,
            lastAssignedAt: 9_999_999,
          }),
        ],
        rule,
      );
      expect(ranked).toEqual(['free-worst', 'busy-best']);
    });

    it('puts the preferred staff member first among equally busy ones', () => {
      const candidates = [
        candidate('a', { price: 1, dayLoad: 0, lastAssignedAt: 1 }),
        candidate('z', { price: 9000, dayLoad: 9, lastAssignedAt: 9000 }),
      ];
      expect(rankStaff(candidates, rule, 'z')).toEqual(['z', 'a']);
    });

    it('ranks free before a busy preferred staff member', () => {
      const candidates = [
        candidate('a'),
        candidate('preferred', { busy: true }),
      ];
      expect(rankStaff(candidates, rule, 'preferred')).toEqual([
        'a',
        'preferred',
      ]);
    });

    it('breaks a full tie by id', () => {
      const candidates = ['c', 'a', 'b'].map((id) => candidate(id));
      expect(rankStaff(candidates, rule)).toEqual(['a', 'b', 'c']);
    });

    it('ignores a preferred id that is not a candidate', () => {
      const candidates = ['b', 'a'].map((id) => candidate(id));
      expect(rankStaff(candidates, rule, 'nobody')).toEqual(['a', 'b']);
    });

    it('returns an empty list for no candidates and does not mutate the input', () => {
      expect(rankStaff([], rule)).toEqual([]);
      const candidates = [candidate('b'), candidate('a')];
      rankStaff(candidates, rule);
      expect(candidates.map(({ id }) => id)).toEqual(['b', 'a']);
    });
  });

  describe('ROUND_ROBIN lastAssignedAt', () => {
    it('never assigned (null) goes before any assigned staff member', () => {
      const ranked = rankStaff(
        [
          candidate('a', { lastAssignedAt: 0 }),
          candidate('b', { lastAssignedAt: null }),
          candidate('c', { lastAssignedAt: 1 }),
        ],
        AnyStaffRule.ROUND_ROBIN,
      );
      expect(ranked).toEqual(['b', 'a', 'c']);
    });

    it('two never-assigned staff members fall to load, then id', () => {
      const ranked = rankStaff(
        [
          candidate('d', { dayLoad: 1 }),
          candidate('c', { dayLoad: 0 }),
          candidate('b', { dayLoad: 1 }),
          candidate('a', { lastAssignedAt: 5 }),
        ],
        AnyStaffRule.ROUND_ROBIN,
      );
      expect(ranked).toEqual(['c', 'b', 'd', 'a']);
    });
  });

  it('ignores price in ROUND_ROBIN and last assignment in the price rules', () => {
    const candidates = [
      candidate('a', { price: 1, lastAssignedAt: 9 }),
      candidate('b', { price: 9, lastAssignedAt: 1 }),
    ];
    expect(rankStaff(candidates, AnyStaffRule.ROUND_ROBIN)).toEqual(['b', 'a']);
    expect(rankStaff(candidates, AnyStaffRule.CHEAPER_AND_FREER)).toEqual([
      'a',
      'b',
    ]);
    expect(rankStaff(candidates, AnyStaffRule.PRICIER)).toEqual(['b', 'a']);
  });
});
