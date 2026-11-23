import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** Integer minor units as an API amount: "49.90". Negative amounts keep the sign. */
export function minorToApi(minor: number): string {
  return MoneyUtils.format(MoneyUtils.fromMinor(minor));
}
