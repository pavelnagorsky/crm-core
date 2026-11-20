import {
  isOwnHost,
  normalizeReferrerHost,
  normalizeTrafficDetail,
  normalizeTrafficToken,
  sanitizeTouchedAt,
  sanitizeTrafficValue,
  sanitizeUtmValue,
} from './traffic-sanitize.rules.js';

describe('traffic sanitizing', () => {
  describe('sanitizeTrafficValue', () => {
    it.each<[string, unknown, string | undefined]>([
      ['a plain string', 'vk', 'vk'],
      ['trims whitespace', '  vk  ', 'vk'],
      ['strips control characters', 'in\u0000sta\u0007\n', 'insta'],
      ['cuts to the max length', 'abcdefghij', 'abcde'],
      ['an empty string', '', undefined],
      ['whitespace only', '   \t', undefined],
      ['control characters only', '\u0001\u0002', undefined],
      ['a number', 42, undefined],
      ['an array', ['a'], undefined],
      ['an object', { a: 1 }, undefined],
      ['null', null, undefined],
      ['undefined', undefined, undefined],
    ])('%s', (_name, value, expected) => {
      expect(sanitizeTrafficValue(value, 5)).toBe(expected);
    });
  });

  describe('sanitizeUtmValue', () => {
    it.each<[string, string, string | undefined]>([
      ['keeps a campaign', 'spring_2026', 'spring_2026'],
      ['keeps six digits', 'promo123456', 'promo123456'],
      ['drops seven digits in a row', 'call 2912345', undefined],
      ['drops a phone', '+375291234567', undefined],
      ['drops an email', 'anna@example.com', undefined],
      ['drops an email inside text', 'from anna.k@mail.ru list', undefined],
      ['keeps an @ handle', '@salon_minsk', '@salon_minsk'],
    ])('%s', (_name, value, expected) => {
      expect(sanitizeUtmValue(value, 100)).toBe(expected);
    });
  });

  describe('sanitizeTouchedAt', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');

    it.each<[string, unknown, string | undefined]>([
      ['an ISO moment', '2026-11-19T12:00:00.000Z', '2026-11-19T12:00:00.000Z'],
      ['31 days ago', '2026-10-20T12:00:00.000Z', '2026-10-20T12:00:00.000Z'],
      ['older than 31 days', '2026-10-20T11:59:59.000Z', undefined],
      [
        '5 minutes ahead',
        '2026-11-20T12:05:00.000Z',
        '2026-11-20T12:05:00.000Z',
      ],
      ['more than 5 minutes ahead', '2026-11-20T12:05:01.000Z', undefined],
      ['not a date', 'yesterday', undefined],
      ['a number', 1_700_000_000_000, undefined],
      ['empty', '', undefined],
    ])('%s', (_name, value, expected) => {
      expect(sanitizeTouchedAt(value, now)?.toISOString()).toBe(expected);
    });
  });

  describe('normalizeTrafficToken', () => {
    it.each<[string | undefined, string | undefined]>([
      ['Instagram', 'instagram'],
      ['  Yandex   Maps ', 'yandex_maps'],
      ['ЯНДЕКС КАРТЫ', 'яндекс_карты'],
      ['   ', undefined],
      [undefined, undefined],
    ])('%s -> %s', (value, expected) => {
      expect(normalizeTrafficToken(value)).toBe(expected);
    });
  });

  describe('normalizeTrafficDetail', () => {
    it.each<[string | null, string | null]>([
      ['VK_Ads', 'vk_ads'],
      ['Blogger Anna', 'blogger_anna'],
      ['  a / b  ', 'a_b'],
      ['__x__', 'x'],
      ['salon-blog.ru', 'salon-blog.ru'],
      ['Весна 2026!', 'весна_2026'],
      ['!!!', null],
      ['', null],
      [null, null],
    ])('%s -> %s', (value, expected) => {
      expect(normalizeTrafficDetail(value)).toBe(expected);
    });

    it('cuts to 64 without a trailing underscore', () => {
      expect(normalizeTrafficDetail(`${'a'.repeat(63)} b`)).toBe(
        'a'.repeat(63),
      );
    });
  });

  describe('normalizeReferrerHost', () => {
    it.each<[string, string | undefined, string | null]>([
      ['a bare host', 'instagram.com', 'instagram.com'],
      ['uppercase and whitespace', '  VK.COM ', 'vk.com'],
      ['a full URL', 'https://l.instagram.com/?u=x', 'l.instagram.com'],
      ['a port', 'example.com:8080', 'example.com'],
      ['a trailing dot', 'example.com.', 'example.com'],
      ['www.', 'www.example.com', 'example.com'],
      ['www2.', 'www2.example.com', 'example.com'],
      ['m.', 'm.vk.com', 'vk.com'],
      ['m. of a one-label rest', 'm.localhost', 'm.localhost'],
      ['punycode of a Cyrillic host', 'салон.рф', 'xn--80awgdm.xn--p1ai'],
      ['an IPv4', '192.168.0.1', '192.168.0.1'],
      ['an IPv6', '[2001:db8::1]', null],
      ['spaces inside', 'not a host', null],
      ['an underscore label', 'bad_host.com', null],
      ['a mailto URL', 'mailto:a@b.c', null],
      ['empty', '', null],
      ['undefined', undefined, null],
    ])('%s', (_name, value, expected) => {
      expect(normalizeReferrerHost(value)).toBe(expected);
    });

    it('drops a host longer than 253', () => {
      const label = 'a'.repeat(60);
      expect(
        normalizeReferrerHost(
          [label, label, label, label, label, 'com'].join('.'),
        ),
      ).toBeNull();
    });
  });

  describe('isOwnHost', () => {
    it.each<[string, boolean]>([
      ['klendo.ru', true],
      ['app.klendo.ru', true],
      ['notklendo.ru', false],
      ['klendo.ru.evil.com', false],
    ])('%s -> %s', (host, expected) => {
      expect(isOwnHost(host, ['klendo.ru'])).toBe(expected);
    });
  });
});
