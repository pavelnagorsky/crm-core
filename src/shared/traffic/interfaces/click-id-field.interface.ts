import { ClickIdType } from '../enums/click-id-type.enum.js';
import { TrafficTouch } from './traffic-touch.interface.js';

export interface ClickIdField {
  field: keyof Pick<
    TrafficTouch,
    | 'gclid'
    | 'gbraid'
    | 'wbraid'
    | 'yclid'
    | 'ysclid'
    | 'fbclid'
    | 'ttclid'
    | 'msclkid'
  >;
  type: ClickIdType;
  /** Ad platform of a paid click, the detail when no utm_source is set; null for an unpaid click. */
  paidPlatform: string | null;
}
