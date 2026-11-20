/** A visitor's last non-direct touch as the client sent it, after sanitizing. */
export interface TrafficTouch {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  yclid?: string;
  ysclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  referrerHost?: string;
  touchedAt?: Date;
}
