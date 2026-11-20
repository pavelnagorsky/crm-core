/** Normalized utm_medium values of paid placements. */
export const PAID_MEDIUMS: ReadonlySet<string> = new Set([
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
]);

/** utm_medium values that turn a yandex or google utm_source into a maps listing. */
export const MAPS_MEDIUMS: ReadonlySet<string> = new Set([
  'maps',
  'map',
  'geo',
  'listing',
  'business',
]);

/** utm_medium values of organic search; an empty medium counts too. */
export const SEARCH_MEDIUMS: ReadonlySet<string> = new Set([
  'organic',
  'search',
  'seo',
]);

export const MAILING_MEDIUMS: ReadonlySet<string> = new Set([
  'email',
  'e-mail',
  'newsletter',
  'mail',
  'sms',
  'push',
  'рассылка',
]);

export const OFFLINE_MEDIUMS: ReadonlySet<string> = new Set([
  'offline',
  'qr',
  'print',
  'flyer',
  'leaflet',
  'poster',
  'листовка',
  'листовки',
]);

export const REFERRAL_MEDIUMS: ReadonlySet<string> = new Set([
  'referral',
  'referral_program',
  'invite',
  'friend',
]);
