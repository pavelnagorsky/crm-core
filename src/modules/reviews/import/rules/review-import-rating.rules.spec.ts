import { parseImportRating } from './review-import-rating.rules.js';

describe('parseImportRating', () => {
  it.each([
    [5, 5],
    [1, 1],
    ['5', 5],
    ['4.0', 4],
    ['3,0', 3],
    ['5 звёзд', 5],
    ['5 звезд', 5],
    ['2 звезды', 2],
    ['1 звезда', 1],
    ['4 stars', 4],
    [' 4 ', 4],
  ])('accepts %j as %i', (value, expected) => {
    expect(parseImportRating(value)).toBe(expected);
  });

  it.each([
    [0],
    [6],
    [4.5],
    ['4.5'],
    ['0'],
    ['10'],
    ['five'],
    ['5 из 5'],
    [''],
    [null],
    [true],
    [new Date('2025-01-01T00:00:00Z')],
  ])('rejects %j', (value) => {
    expect(parseImportRating(value)).toBeNull();
  });
});
