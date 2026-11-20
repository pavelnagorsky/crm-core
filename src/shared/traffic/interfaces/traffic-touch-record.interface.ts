import { ClickIdType } from '../enums/click-id-type.enum.js';

/** The evidence stored with an online booking: raw UTM values, external referrer host, one click id. */
export interface TrafficTouchRecord {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrerHost: string | null;
  clickIdType: ClickIdType | null;
  clickId: string | null;
  touchedAt: Date | null;
}
