import { ClickIdType } from '../enums/click-id-type.enum.js';
import { TrafficSource } from '../enums/traffic-source.enum.js';
import { TrafficTouch } from '../interfaces/traffic-touch.interface.js';
import { classifyTraffic } from './traffic-classify.rules.js';

const OWN = ['klendo.ru'];

function classify(touch: TrafficTouch | undefined) {
  const { source, detail } = classifyTraffic(touch, OWN);
  return { source, detail };
}

describe('classifyTraffic', () => {
  describe('1. paid click ids', () => {
    it.each<[string, TrafficTouch, string]>([
      ['gclid', { gclid: 'abc' }, 'google'],
      ['gbraid', { gbraid: 'abc' }, 'google'],
      ['wbraid', { wbraid: 'abc' }, 'google'],
      ['yclid', { yclid: '123' }, 'yandex'],
      ['ttclid', { ttclid: 'abc' }, 'tiktok'],
      ['msclkid', { msclkid: 'abc' }, 'bing'],
    ])('%s is PAID_ADS with the platform', (_name, touch, detail) => {
      expect(classify(touch)).toEqual({
        source: TrafficSource.PAID_ADS,
        detail,
      });
    });

    it('takes the utm_source as the detail over the platform', () => {
      expect(classify({ yclid: '1', utmSource: 'Yandex_Direct' })).toEqual({
        source: TrafficSource.PAID_ADS,
        detail: 'yandex_direct',
      });
    });

    it('beats a known utm_source and a referrer', () => {
      expect(
        classify({
          gclid: 'x',
          utmSource: 'instagram',
          referrerHost: 'instagram.com',
        }).source,
      ).toBe(TrafficSource.PAID_ADS);
    });
  });

  describe('2. paid utm_medium', () => {
    it.each([
      'cpc',
      'ppc',
      'cpm',
      'cpa',
      'cpv',
      'paid',
      'paid_social',
      'paidsocial',
      'ads',
      'ad',
      'display',
      'banner',
      'retargeting',
      'target',
      'targeting',
      'таргет',
      'CPC',
      ' Paid Social ',
    ])('%s is PAID_ADS', (medium) => {
      expect(classify({ utmSource: 'vk_ads', utmMedium: medium })).toEqual({
        source: TrafficSource.PAID_ADS,
        detail: 'vk_ads',
      });
    });

    it('beats a known utm_source', () => {
      expect(classify({ utmSource: 'instagram', utmMedium: 'cpc' })).toEqual({
        source: TrafficSource.PAID_ADS,
        detail: 'instagram',
      });
    });

    it('has no detail without a utm_source', () => {
      expect(classify({ utmMedium: 'cpc' })).toEqual({
        source: TrafficSource.PAID_ADS,
        detail: null,
      });
    });
  });

  describe('3. utm_source aliases', () => {
    it.each<[string, TrafficSource]>([
      ['ig', TrafficSource.INSTAGRAM],
      ['instagram', TrafficSource.INSTAGRAM],
      ['insta', TrafficSource.INSTAGRAM],
      ['inst', TrafficSource.INSTAGRAM],
      ['instagram.com', TrafficSource.INSTAGRAM],
      ['l.instagram.com', TrafficSource.INSTAGRAM],
      ['инстаграм', TrafficSource.INSTAGRAM],
      ['Инста', TrafficSource.INSTAGRAM],
      ['vk', TrafficSource.VK],
      ['vkontakte', TrafficSource.VK],
      ['vk.com', TrafficSource.VK],
      ['vk.ru', TrafficSource.VK],
      ['вк', TrafficSource.VK],
      ['ВКонтакте', TrafficSource.VK],
      ['tg', TrafficSource.TELEGRAM],
      ['telegram', TrafficSource.TELEGRAM],
      ['t.me', TrafficSource.TELEGRAM],
      ['телеграм', TrafficSource.TELEGRAM],
      ['телеграмм', TrafficSource.TELEGRAM],
      ['wa', TrafficSource.WHATSAPP],
      ['WhatsApp', TrafficSource.WHATSAPP],
      ['wa.me', TrafficSource.WHATSAPP],
      ['ватсап', TrafficSource.WHATSAPP],
      ['вотсап', TrafficSource.WHATSAPP],
      ['tiktok', TrafficSource.TIKTOK],
      ['tt', TrafficSource.TIKTOK],
      ['tik tok', TrafficSource.TIKTOK],
      ['fb', TrafficSource.FACEBOOK],
      ['facebook', TrafficSource.FACEBOOK],
      ['facebook.com', TrafficSource.FACEBOOK],
      ['yandex_maps', TrafficSource.YANDEX_MAPS],
      ['yandexmaps', TrafficSource.YANDEX_MAPS],
      ['ymaps', TrafficSource.YANDEX_MAPS],
      ['yamaps', TrafficSource.YANDEX_MAPS],
      ['maps.yandex', TrafficSource.YANDEX_MAPS],
      ['Яндекс Карты', TrafficSource.YANDEX_MAPS],
      ['2gis', TrafficSource.TWO_GIS],
      ['dgis', TrafficSource.TWO_GIS],
      ['2ГИС', TrafficSource.TWO_GIS],
      ['2gis.ru', TrafficSource.TWO_GIS],
      ['google_maps', TrafficSource.GOOGLE_MAPS],
      ['googlemaps', TrafficSource.GOOGLE_MAPS],
      ['gmaps', TrafficSource.GOOGLE_MAPS],
      ['gmb', TrafficSource.GOOGLE_MAPS],
      ['gbp', TrafficSource.GOOGLE_MAPS],
      ['google_business', TrafficSource.GOOGLE_MAPS],
    ])('%s is %s without a detail', (utmSource, source) => {
      expect(classify({ utmSource })).toEqual({ source, detail: null });
    });

    it.each<[string, string, TrafficSource]>([
      ['yandex', 'maps', TrafficSource.YANDEX_MAPS],
      ['yandex', 'map', TrafficSource.YANDEX_MAPS],
      ['yandex', 'geo', TrafficSource.YANDEX_MAPS],
      ['yandex', 'listing', TrafficSource.YANDEX_MAPS],
      ['Yandex', 'Business', TrafficSource.YANDEX_MAPS],
      ['google', 'maps', TrafficSource.GOOGLE_MAPS],
      ['google', 'business', TrafficSource.GOOGLE_MAPS],
    ])('%s with medium %s is %s', (utmSource, utmMedium, source) => {
      expect(classify({ utmSource, utmMedium })).toEqual({
        source,
        detail: null,
      });
    });

    it.each<[string, string | undefined]>([
      ['yandex', undefined],
      ['google', 'organic'],
      ['bing', 'search'],
      ['mail.ru', 'seo'],
      ['duckduckgo', undefined],
    ])('%s with medium %s is SEARCH by engine', (utmSource, utmMedium) => {
      expect(classify({ utmSource, utmMedium })).toEqual({
        source: TrafficSource.SEARCH,
        detail: utmSource,
      });
    });

    it('a search engine with another medium is not search', () => {
      expect(classify({ utmSource: 'google', utmMedium: 'social' })).toEqual({
        source: TrafficSource.OTHER,
        detail: 'google',
      });
    });

    it.each<[string, string, TrafficSource]>([
      ['instagram', 'social', TrafficSource.INSTAGRAM],
      ['yandex_maps', 'maps', TrafficSource.YANDEX_MAPS],
      ['2gis', 'maps', TrafficSource.TWO_GIS],
      ['google_maps', 'maps', TrafficSource.GOOGLE_MAPS],
      ['vk', 'social', TrafficSource.VK],
      ['telegram', 'social', TrafficSource.TELEGRAM],
    ])('link preset %s/%s is %s', (utmSource, utmMedium, source) => {
      expect(classify({ utmSource, utmMedium })).toEqual({
        source,
        detail: null,
      });
    });

    it.each(['vk_ads', 'yandex_direct', 'my_platform'])(
      'ad preset %s/cpc is PAID_ADS with the platform',
      (utmSource) => {
        expect(classify({ utmSource, utmMedium: 'cpc' })).toEqual({
          source: TrafficSource.PAID_ADS,
          detail: utmSource,
        });
      },
    );
  });

  describe('4. mailing, offline and referral mediums', () => {
    it.each([
      'email',
      'e-mail',
      'newsletter',
      'mail',
      'sms',
      'push',
      'рассылка',
    ])('%s is MAILING', (utmMedium) => {
      expect(classify({ utmSource: 'promo_list', utmMedium })).toEqual({
        source: TrafficSource.MAILING,
        detail: 'promo_list',
      });
    });

    it.each([
      'offline',
      'qr',
      'print',
      'flyer',
      'leaflet',
      'poster',
      'листовка',
      'листовки',
    ])('%s is OFFLINE', (utmMedium) => {
      expect(classify({ utmSource: 'mall', utmMedium })).toEqual({
        source: TrafficSource.OFFLINE,
        detail: 'mall',
      });
    });

    it('offline without a source takes the campaign as the detail', () => {
      expect(classify({ utmMedium: 'qr', utmCampaign: 'Spring Sale' })).toEqual(
        {
          source: TrafficSource.OFFLINE,
          detail: 'spring_sale',
        },
      );
    });

    it.each(['referral', 'referral_program', 'invite', 'friend'])(
      'medium %s is REFERRAL',
      (utmMedium) => {
        expect(classify({ utmSource: 'anna', utmMedium })).toEqual({
          source: TrafficSource.REFERRAL,
          detail: 'anna',
        });
      },
    );

    it.each(['friend', 'recommendation', 'рекомендация'])(
      'source %s is REFERRAL without a detail',
      (utmSource) => {
        expect(classify({ utmSource })).toEqual({
          source: TrafficSource.REFERRAL,
          detail: null,
        });
      },
    );

    it('a known utm_source beats a mailing medium', () => {
      expect(classify({ utmSource: 'tg', utmMedium: 'push' }).source).toBe(
        TrafficSource.TELEGRAM,
      );
    });
  });

  describe('5. referrer hosts', () => {
    it.each<[string, TrafficSource, string | null]>([
      ['instagram.com', TrafficSource.INSTAGRAM, null],
      ['l.instagram.com', TrafficSource.INSTAGRAM, null],
      ['www.instagram.com', TrafficSource.INSTAGRAM, null],
      ['facebook.com', TrafficSource.FACEBOOK, null],
      ['l.facebook.com', TrafficSource.FACEBOOK, null],
      ['lm.facebook.com', TrafficSource.FACEBOOK, null],
      ['m.facebook.com', TrafficSource.FACEBOOK, null],
      ['fb.com', TrafficSource.FACEBOOK, null],
      ['vk.com', TrafficSource.VK, null],
      ['vk.ru', TrafficSource.VK, null],
      ['away.vk.com', TrafficSource.VK, null],
      ['vk.cc', TrafficSource.VK, null],
      ['t.me', TrafficSource.TELEGRAM, null],
      ['telegram.me', TrafficSource.TELEGRAM, null],
      ['telegram.org', TrafficSource.TELEGRAM, null],
      ['web.telegram.org', TrafficSource.TELEGRAM, null],
      ['wa.me', TrafficSource.WHATSAPP, null],
      ['whatsapp.com', TrafficSource.WHATSAPP, null],
      ['web.whatsapp.com', TrafficSource.WHATSAPP, null],
      ['tiktok.com', TrafficSource.TIKTOK, null],
      ['2gis.ru', TrafficSource.TWO_GIS, null],
      ['go.2gis.com', TrafficSource.TWO_GIS, null],
      ['2gis.by', TrafficSource.TWO_GIS, null],
      ['maps.google.com', TrafficSource.GOOGLE_MAPS, null],
      ['maps.google.ru', TrafficSource.GOOGLE_MAPS, null],
      ['maps.yandex.ru', TrafficSource.YANDEX_MAPS, null],
      ['maps.yandex.by', TrafficSource.YANDEX_MAPS, null],
      ['googleadservices.com', TrafficSource.PAID_ADS, 'google'],
      ['ad.doubleclick.net', TrafficSource.PAID_ADS, 'google'],
      ['yandex.ru', TrafficSource.SEARCH, 'yandex'],
      ['yandex.by', TrafficSource.SEARCH, 'yandex'],
      ['yandex.com.tr', TrafficSource.SEARCH, 'yandex'],
      ['ya.ru', TrafficSource.SEARCH, 'yandex'],
      ['google.com', TrafficSource.SEARCH, 'google'],
      ['www.google.co.uk', TrafficSource.SEARCH, 'google'],
      ['bing.com', TrafficSource.SEARCH, 'bing'],
      ['duckduckgo.com', TrafficSource.SEARCH, 'duckduckgo'],
      ['go.mail.ru', TrafficSource.SEARCH, 'mail.ru'],
      ['search.yahoo.com', TrafficSource.SEARCH, 'yahoo'],
    ])('%s is %s / %s', (referrerHost, source, detail) => {
      expect(classify({ referrerHost })).toEqual({ source, detail });
    });

    it('a social host keeps an unknown utm_source as the detail', () => {
      expect(
        classify({ referrerHost: 'l.instagram.com', utmSource: 'bio_link' }),
      ).toEqual({ source: TrafficSource.INSTAGRAM, detail: 'bio_link' });
    });

    it('accepts a full referrer URL with port and path', () => {
      expect(
        classify({ referrerHost: 'https://M.VK.COM:443/wall-1_2?x=1' }),
      ).toEqual({ source: TrafficSource.VK, detail: null });
    });

    it('a google subdomain other than maps is a website', () => {
      expect(classify({ referrerHost: 'news.google.com' })).toEqual({
        source: TrafficSource.WEBSITE,
        detail: 'news.google.com',
      });
    });

    describe('ysclid', () => {
      it('without a referrer is Yandex search, not an ad', () => {
        expect(classify({ ysclid: 'lxyz123' })).toEqual({
          source: TrafficSource.SEARCH,
          detail: 'yandex',
        });
      });

      it('with our own host as the referrer is Yandex search', () => {
        expect(
          classify({ ysclid: 'lxyz', referrerHost: 'app.klendo.ru' }),
        ).toEqual({ source: TrafficSource.SEARCH, detail: 'yandex' });
      });

      it('with an external site as the referrer is that site', () => {
        expect(
          classify({ ysclid: 'lxyz', referrerHost: 'salon-blog.ru' }),
        ).toEqual({ source: TrafficSource.WEBSITE, detail: 'salon-blog.ru' });
      });

      it('yclid is a paid click', () => {
        expect(classify({ yclid: '1', ysclid: '2' })).toEqual({
          source: TrafficSource.PAID_ADS,
          detail: 'yandex',
        });
      });
    });
  });

  describe('6-9. fallbacks', () => {
    it('an unknown utm_source is OTHER with the source', () => {
      expect(
        classify({ utmSource: 'Blogger Anna', referrerHost: 'blog.ru' }),
      ).toEqual({ source: TrafficSource.OTHER, detail: 'blogger_anna' });
    });

    it('an unknown external host is WEBSITE with the host', () => {
      expect(classify({ referrerHost: 'www.salon-review.ru' })).toEqual({
        source: TrafficSource.WEBSITE,
        detail: 'salon-review.ru',
      });
    });

    it('fbclid alone is INSTAGRAM', () => {
      expect(classify({ fbclid: 'abc' })).toEqual({
        source: TrafficSource.INSTAGRAM,
        detail: null,
      });
    });

    it('fbclid with an external host is that host', () => {
      expect(
        classify({ fbclid: 'abc', referrerHost: 'linktr.ee' }).source,
      ).toBe(TrafficSource.WEBSITE);
    });

    it.each<[string, TrafficTouch | undefined]>([
      ['no touch', undefined],
      ['an empty touch', {}],
      ['our own host', { referrerHost: 'klendo.ru' }],
      ['our own subdomain', { referrerHost: 'https://book.klendo.ru/x' }],
      ['an invalid host', { referrerHost: 'not a host!' }],
      ['an IPv6 host', { referrerHost: '[::1]' }],
      ['utm_campaign alone', { utmCampaign: 'spring' }],
    ])('%s is DIRECT', (_name, touch) => {
      expect(classify(touch)).toEqual({
        source: TrafficSource.DIRECT,
        detail: null,
      });
    });

    it('an IPv4 referrer is a website', () => {
      expect(classify({ referrerHost: '10.0.0.1:8080' })).toEqual({
        source: TrafficSource.WEBSITE,
        detail: '10.0.0.1',
      });
    });

    it('a punycode host is a website with its ASCII host', () => {
      expect(classify({ referrerHost: 'салон.рф' })).toEqual({
        source: TrafficSource.WEBSITE,
        detail: 'xn--80awgdm.xn--p1ai',
      });
    });
  });

  describe('detail', () => {
    it('is lowercase with unsafe characters as "_" and cut to 64', () => {
      const long = `Spring Promo!! ${'x'.repeat(80)}`;
      const { detail } = classify({ utmSource: long });
      expect(detail).toBe(`spring_promo_${'x'.repeat(51)}`);
      expect(detail).toHaveLength(64);
    });

    it('keeps Cyrillic letters, digits, dots and dashes', () => {
      expect(classify({ utmSource: 'Блогер-Анна.2' }).detail).toBe(
        'блогер-анна.2',
      );
    });
  });

  describe('touch record', () => {
    const touchedAt = new Date('2026-11-20T10:00:00.000Z');

    it('is null for a direct visit', () => {
      expect(classifyTraffic({ touchedAt }, OWN).touch).toBeNull();
    });

    it('keeps raw UTM values, the external host and the first paid click id', () => {
      expect(
        classifyTraffic(
          {
            utmSource: 'Instagram',
            utmMedium: 'Social',
            utmCampaign: 'Spring',
            utmContent: 'story',
            utmTerm: 'nails',
            referrerHost: 'https://www.instagram.com/p/1',
            fbclid: 'fb1',
            yclid: 'y1',
            touchedAt,
          },
          OWN,
        ).touch,
      ).toEqual({
        utmSource: 'Instagram',
        utmMedium: 'Social',
        utmCampaign: 'Spring',
        utmContent: 'story',
        utmTerm: 'nails',
        referrerHost: 'instagram.com',
        clickIdType: ClickIdType.YCLID,
        clickId: 'y1',
        touchedAt,
      });
    });

    it('drops our own host from the evidence', () => {
      expect(
        classifyTraffic({ referrerHost: 'klendo.ru', ysclid: 's1' }, OWN).touch,
      ).toEqual(
        expect.objectContaining({
          referrerHost: null,
          clickIdType: ClickIdType.YSCLID,
          clickId: 's1',
        }),
      );
    });
  });
});
