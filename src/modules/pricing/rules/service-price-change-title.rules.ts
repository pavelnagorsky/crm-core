import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';

/** 10.00 -> "10", 2.50 -> "2.5". */
function trimmed(minor: number): string {
  return MoneyUtils.fromMinor(Math.abs(minor)).toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Title of a rule change for history and audit: `+10%`, `-5 BYN`, `Новые цены`, then
 * `, округление до 1 BYN` when the step is not 0.01. Minus is a plain hyphen.
 */
export function ruleChangeTitle(
  spec: Pick<PriceChangeSpec, 'mode' | 'value' | 'step'>,
  currency: string,
): string {
  const sign = (spec.value ?? 0) < 0 ? '-' : '+';
  let title: string;
  if (spec.mode === PriceChangeMode.SET) title = 'Новые цены';
  else if (spec.value === null) title = 'Новые цены';
  else if (spec.mode === PriceChangeMode.PERCENT)
    title = `${sign}${trimmed(spec.value)}%`;
  else title = `${sign}${trimmed(spec.value)} ${currency}`;
  if (spec.step !== 1) title += `, округление до ${trimmed(spec.step)} ${currency}`;
  return title;
}

/** Title of a change made by an Excel upload. */
export function importChangeTitle(fileName: string): string {
  return `Загрузка из Excel: ${fileName}`.slice(0, 200);
}
