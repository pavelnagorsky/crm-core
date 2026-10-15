import { CountryDefault } from './interfaces/country-default.interface.js';

export const COUNTRY_DEFAULTS = {
  BY: {
    currency: 'BYN',
    timezones: ['Europe/Minsk'],
    defaultTimezone: 'Europe/Minsk',
  },
  RU: {
    currency: 'RUB',
    timezones: [
      'Europe/Kaliningrad',
      'Europe/Moscow',
      'Europe/Samara',
      'Asia/Yekaterinburg',
      'Asia/Omsk',
      'Asia/Novosibirsk',
      'Asia/Barnaul',
      'Asia/Krasnoyarsk',
      'Asia/Irkutsk',
      'Asia/Yakutsk',
      'Asia/Vladivostok',
      'Asia/Magadan',
      'Asia/Kamchatka',
    ],
    defaultTimezone: 'Europe/Moscow',
  },
  KZ: {
    currency: 'KZT',
    timezones: [
      'Asia/Almaty',
      'Asia/Aqtau',
      'Asia/Aqtobe',
      'Asia/Atyrau',
      'Asia/Oral',
      'Asia/Qostanay',
    ],
    defaultTimezone: 'Asia/Almaty',
  },
} as const satisfies Record<string, CountryDefault>;

export type CountryCode = keyof typeof COUNTRY_DEFAULTS;
