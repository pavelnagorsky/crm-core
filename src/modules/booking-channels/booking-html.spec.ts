import { sanitizeBookingHtml } from './booking-html.js';

describe('sanitizeBookingHtml', () => {
  it('drops scripts, event handlers, and javascript urls', () => {
    const clean = sanitizeBookingHtml(
      '<script>alert(1)</script><p onclick="alert(1)">Hi</p><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>',
    );
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('Hi');
    expect(clean).toContain('href="https://example.com"');
  });

  it('keeps editor markup', () => {
    const html = '<div class="lead" style="color:red"><span>Text</span><img src="https://cdn.example/a.png" alt="cover"><details open><summary>More</summary></details></div>';
    const clean = sanitizeBookingHtml(html);
    expect(clean).toContain('class="lead"');
    expect(clean).toContain('style="color:red"');
    expect(clean).toContain('<span>Text</span>');
    expect(clean).toContain('src="https://cdn.example/a.png"');
    expect(clean).toContain('<details open>');
  });

  it('is stable when run twice', () => {
    const once = sanitizeBookingHtml('<p><strong>Hello</strong></p>');
    expect(sanitizeBookingHtml(once)).toBe(once);
  });
});
