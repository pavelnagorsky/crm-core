import { reviewImportKey } from './review-import-key.rules.js';

const review = {
  id: null,
  author: 'Анна Козлова',
  dateKey: '2025-03-05T12:00:00',
  rating: 5,
  text: 'Всё понравилось',
};

describe('reviewImportKey', () => {
  it('uses the id from the old system when present', () => {
    expect(reviewImportKey({ ...review, id: 'yc-42' })).toBe('id:yc-42');
  });

  it('hashes author, date, rating and text ignoring case and spacing', () => {
    const key = reviewImportKey(review);
    expect(key).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(
      reviewImportKey({
        ...review,
        author: '  анна   КОЗЛОВА ',
        text: 'ВСЁ  понравилось',
      }),
    ).toBe(key);
  });

  it.each([
    ['author', { author: 'Анна Иванова' }],
    ['date', { dateKey: '2025-03-06T12:00:00' }],
    ['rating', { rating: 4 }],
    ['text', { text: 'Всё понравилось!' }],
  ])('changes with the %s', (_field, change) => {
    expect(reviewImportKey({ ...review, ...change })).not.toBe(
      reviewImportKey(review),
    );
  });

  it('fits the importKey column for the longest allowed id', () => {
    expect(reviewImportKey({ ...review, id: 'x'.repeat(128) }).length).toBe(
      131,
    );
  });
});
