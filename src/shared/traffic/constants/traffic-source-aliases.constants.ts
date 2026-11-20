import { TrafficSource } from '../enums/traffic-source.enum.js';

function aliases(
  source: TrafficSource,
  tokens: readonly string[],
): [string, TrafficSource][] {
  return tokens.map((token) => [token, source]);
}

/** Normalized utm_source values that name the source on their own. */
export const UTM_SOURCE_ALIASES: ReadonlyMap<string, TrafficSource> = new Map([
  ...aliases(TrafficSource.INSTAGRAM, [
    'ig',
    'instagram',
    'insta',
    'inst',
    'instagram.com',
    'l.instagram.com',
    'инстаграм',
    'инста',
  ]),
  ...aliases(TrafficSource.VK, [
    'vk',
    'vkontakte',
    'vk.com',
    'vk.ru',
    'вк',
    'вконтакте',
  ]),
  ...aliases(TrafficSource.TELEGRAM, [
    'tg',
    'telegram',
    't.me',
    'телеграм',
    'телеграмм',
  ]),
  ...aliases(TrafficSource.WHATSAPP, [
    'wa',
    'whatsapp',
    'wa.me',
    'ватсап',
    'вотсап',
  ]),
  ...aliases(TrafficSource.TIKTOK, ['tiktok', 'tt', 'tik_tok']),
  ...aliases(TrafficSource.FACEBOOK, ['fb', 'facebook', 'facebook.com']),
  ...aliases(TrafficSource.YANDEX_MAPS, [
    'yandex_maps',
    'yandexmaps',
    'ymaps',
    'yamaps',
    'maps.yandex',
    'яндекс_карты',
  ]),
  ...aliases(TrafficSource.TWO_GIS, ['2gis', 'dgis', '2гис', '2gis.ru']),
  ...aliases(TrafficSource.GOOGLE_MAPS, [
    'google_maps',
    'googlemaps',
    'gmaps',
    'gmb',
    'gbp',
    'google_business',
  ]),
]);

/** utm_source of a platform that is a maps listing only with a maps utm_medium. */
export const MAP_PLATFORM_SOURCES: ReadonlyMap<string, TrafficSource> = new Map(
  [
    ['yandex', TrafficSource.YANDEX_MAPS],
    ['google', TrafficSource.GOOGLE_MAPS],
  ],
);

/** utm_source of a search engine; organic only with an empty or search utm_medium. */
export const SEARCH_ENGINE_SOURCES: ReadonlySet<string> = new Set([
  'yandex',
  'google',
  'bing',
  'mail.ru',
  'duckduckgo',
]);

/** utm_source values that mean a recommendation without naming who made it. */
export const REFERRAL_SOURCES: ReadonlySet<string> = new Set([
  'friend',
  'recommendation',
  'рекомендация',
]);
