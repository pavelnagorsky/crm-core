import { buildReviewSummary } from '../rules/review-summary.rules.js';
import { LocationReviewsOverviewDto } from './location-reviews-overview.dto.js';

const review = {
  id: 'r1',
  authorFirstName: null,
  authorLastName: null,
  rating: 5,
  text: 'ok',
  reviewedAt: new Date('2026-10-01T10:00:00Z'),
  replyText: null,
  repliedAt: null,
  staff: [],
};

describe('LocationReviewsOverviewDto', () => {
  it('is null while there are no published reviews', () => {
    expect(
      LocationReviewsOverviewDto.fromOverview({
        summary: buildReviewSummary([]),
        latest: [],
      }),
    ).toBeNull();
  });

  it('lists the distribution from 5 down to 1 and keeps anonymous authors null', () => {
    const dto = LocationReviewsOverviewDto.fromOverview({
      summary: buildReviewSummary([
        { rating: 5, count: 2 },
        { rating: 3, count: 1 },
      ]),
      latest: [review as never],
    });
    expect(dto?.summary.count).toBe(3);
    expect(dto?.summary.average).toBe(4.3);
    expect(dto?.summary.distribution).toEqual([
      { rating: 5, count: 2 },
      { rating: 4, count: 0 },
      { rating: 3, count: 1 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
    expect(dto?.latest[0].authorName).toBeNull();
    expect(dto?.latest[0].reply).toBeNull();
  });
});
