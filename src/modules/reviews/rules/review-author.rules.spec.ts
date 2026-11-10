import { authorSnapshot, maskAuthorName } from './review-author.rules.js';

describe('maskAuthorName', () => {
  it.each([
    ['Анна', 'Козлова', 'Анна К.'],
    ['  Анна ', ' козлова', 'Анна К.'],
    ['Анна', null, 'Анна'],
    [null, 'Козлова', 'К.'],
    [null, null, null],
    ['', ' ', null],
  ])('masks %j %j as %j', (first, last, expected) => {
    expect(
      maskAuthorName({ authorFirstName: first, authorLastName: last }),
    ).toBe(expected);
  });
});

describe('authorSnapshot', () => {
  it('stores blank names as null', () => {
    expect(authorSnapshot('  ')).toBeNull();
    expect(authorSnapshot(' Анна ')).toBe('Анна');
  });
});
