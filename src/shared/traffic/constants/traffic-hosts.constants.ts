import { TrafficSource } from '../enums/traffic-source.enum.js';
import { SearchHostRule } from '../interfaces/search-host-rule.interface.js';
import { TrafficHostRule } from '../interfaces/traffic-host-rule.interface.js';

/** Social and messenger referrers; each domain also matches its subdomains (l., lm., away., web.). */
export const SOCIAL_REFERRER_HOSTS: readonly TrafficHostRule[] = [
  { domain: 'instagram.com', source: TrafficSource.INSTAGRAM },
  { domain: 'facebook.com', source: TrafficSource.FACEBOOK },
  { domain: 'fb.com', source: TrafficSource.FACEBOOK },
  { domain: 'vk.com', source: TrafficSource.VK },
  { domain: 'vk.ru', source: TrafficSource.VK },
  { domain: 'vk.cc', source: TrafficSource.VK },
  { domain: 't.me', source: TrafficSource.TELEGRAM },
  { domain: 'telegram.me', source: TrafficSource.TELEGRAM },
  { domain: 'telegram.org', source: TrafficSource.TELEGRAM },
  { domain: 'wa.me', source: TrafficSource.WHATSAPP },
  { domain: 'whatsapp.com', source: TrafficSource.WHATSAPP },
  { domain: 'tiktok.com', source: TrafficSource.TIKTOK },
];

/** A host label that marks a 2GIS site in any zone: 2gis.ru, go.2gis.com, 2gis.by. */
export const TWO_GIS_HOST_LABEL = '2gis';

/** Host prefixes of maps sites in any zone, such as maps.google.com or maps.yandex.by. */
export const MAPS_HOST_PREFIXES: readonly TrafficHostRule[] = [
  { domain: 'maps.google.', source: TrafficSource.GOOGLE_MAPS },
  { domain: 'maps.yandex.', source: TrafficSource.YANDEX_MAPS },
];

/** Ad click redirectors; the platform is the detail when no utm_source names the campaign. */
export const PAID_REFERRER_HOSTS: readonly SearchHostRule[] = [
  { domain: 'googleadservices.com', engine: 'google' },
  { domain: 'doubleclick.net', engine: 'google' },
];

/** Search engines on a fixed domain. */
export const SEARCH_REFERRER_HOSTS: readonly SearchHostRule[] = [
  { domain: 'ya.ru', engine: 'yandex' },
  { domain: 'bing.com', engine: 'bing' },
  { domain: 'duckduckgo.com', engine: 'duckduckgo' },
  { domain: 'go.mail.ru', engine: 'mail.ru' },
  { domain: 'search.yahoo.com', engine: 'yahoo' },
];

/** Search engines in any country zone: yandex.ru, yandex.com.tr, google.co.uk. */
export const SEARCH_ENGINE_BRANDS: readonly string[] = ['yandex', 'google'];
