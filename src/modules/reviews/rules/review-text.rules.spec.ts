import { sanitizeReviewText } from './review-text.rules.js';

describe('sanitizeReviewText', () => {
  it('drops tags and scripts but keeps text', () => {
    expect(
      sanitizeReviewText('Супер <b>мастер</b><script>alert(1)</script>!'),
    ).toBe('Супер мастер!');
  });

  it('keeps plain symbols without double escaping', () => {
    expect(sanitizeReviewText('Tom & Jerry, 5 > 3 "ok"')).toBe(
      'Tom & Jerry, 5 > 3 "ok"',
    );
  });

  it('does not let entity-encoded tags survive decoding', () => {
    expect(sanitizeReviewText('&lt;b&gt;hi&lt;/b&gt;')).toBe('hi');
    expect(sanitizeReviewText('&amp;lt;script&amp;gt;x')).toBe('');
  });

  it('normalizes line breaks and control characters', () => {
    expect(sanitizeReviewText('a\r\n\r\n\r\n\r\nb\u0000\u0007c  ')).toBe(
      'a\n\nbc',
    );
  });

  it('passes non-strings through for validators to reject', () => {
    expect(sanitizeReviewText(5)).toBe(5);
    expect(sanitizeReviewText(undefined)).toBeUndefined();
  });

  it('turns markup-only input into an empty string', () => {
    expect(sanitizeReviewText('<img src=x onerror=alert(1)>')).toBe('');
  });
});
