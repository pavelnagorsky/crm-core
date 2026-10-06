import { CountryDefault } from './interfaces/country-default.interface.js';

export const COUNTRY_DEFAULTS = {
  AM: {
    currency: 'AMD',
    timezones: ['Asia/Yerevan'],
    defaultTimezone: 'Asia/Yerevan',
  },
  BY: {
    currency: 'BYN',
    timezones: ['Europe/Minsk'],
    defaultTimezone: 'Europe/Minsk',
  },
  GE: {
    currency: 'GEL',
    timezones: ['Asia/Tbilisi'],
    defaultTimezone: 'Asia/Tbilisi',
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
  US: {
    currency: 'USD',
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
    defaultTimezone: 'America/New_York',
  },
} as const satisfies Record<string, CountryDefault>;

export type CountryCode = keyof typeof COUNTRY_DEFAULTS;
