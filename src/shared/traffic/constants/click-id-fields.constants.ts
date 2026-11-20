import { ClickIdType } from '../enums/click-id-type.enum.js';
import { ClickIdField } from '../interfaces/click-id-field.interface.js';

/**
 * Click ids in the order one is kept for a booking: paid clicks first. ysclid marks a Yandex
 * search result, not an ad; fbclid is added to any link leaving Facebook or Instagram.
 */
export const CLICK_ID_FIELDS: readonly ClickIdField[] = [
  { field: 'gclid', type: ClickIdType.GCLID, paidPlatform: 'google' },
  { field: 'gbraid', type: ClickIdType.GBRAID, paidPlatform: 'google' },
  { field: 'wbraid', type: ClickIdType.WBRAID, paidPlatform: 'google' },
  { field: 'yclid', type: ClickIdType.YCLID, paidPlatform: 'yandex' },
  { field: 'ttclid', type: ClickIdType.TTCLID, paidPlatform: 'tiktok' },
  { field: 'msclkid', type: ClickIdType.MSCLKID, paidPlatform: 'bing' },
  { field: 'ysclid', type: ClickIdType.YSCLID, paidPlatform: null },
  { field: 'fbclid', type: ClickIdType.FBCLID, paidPlatform: null },
];
