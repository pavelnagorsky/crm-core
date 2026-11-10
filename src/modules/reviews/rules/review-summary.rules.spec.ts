import {
  buildReviewStaffSummary,
  buildReviewSummary,
} from './review-summary.rules.js';

describe('buildReviewSummary', () => {
  it('returns an empty summary without reviews', () => {
    expect(buildReviewSummary([])).toEqual({
      count: 0,
      average: null,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it.each([1, 2])('hides the average below three reviews: %i', (count) => {
    expect(buildReviewSummary([{ rating: 5, count }]).average).toBeNull();
    expect(buildReviewSummary([{ rating: 5, count }]).count).toBe(count);
  });

  it('exposes a one-decimal average and the distribution from three reviews', () => {
    expect(
      buildReviewSummary([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
      ]),
    ).toEqual({
      count: 3,
      average: 4.7,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
    });
  });

  it('ignores ratings outside 1..5 in the distribution', () => {
    expect(buildReviewSummary([{ rating: 9, count: 1 }]).distribution).toEqual({
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    });
  });
});

describe('buildReviewStaffSummary', () => {
  it('follows the same minimum as the location summary', () => {
    expect(buildReviewStaffSummary([{ rating: 4, count: 2 }])).toEqual({
      count: 2,
      average: null,
    });
    expect(
      buildReviewStaffSummary([
        { rating: 4, count: 2 },
        { rating: 5, count: 1 },
      ]),
    ).toEqual({ count: 3, average: 4.3 });
  });
});
