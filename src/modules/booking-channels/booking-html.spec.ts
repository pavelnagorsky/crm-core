import { sanitizeBookingHtml } from './booking-html.js';

describe('sanitizeBookingHtml', () => {
  it('keeps text and safe links, and drops scripts and handlers', () => {
    const clean = sanitizeBookingHtml(
      '<script>alert(1)</script><p onclick="alert(1)">Hi</p><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>',
    );
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('Hi');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('is stable when run twice', () => {
    const once = sanitizeBookingHtml('<p><strong>Hello</strong></p>');
    expect(sanitizeBookingHtml(once)).toBe(once);
  });
});
