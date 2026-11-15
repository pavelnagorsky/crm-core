import regularExpressions from '../../../shared/regular-expressions.js';

const PREFIX = 'KL-';
const DIGITS = 6;

/** Human payment number for the payment purpose: KL-000123. */
export class PaymentReference {
  private constructor() {}

  static format(number: number): string {
    return `${PREFIX}${String(number).padStart(DIGITS, '0')}`;
  }

  /** Accepts "KL-000123", "kl123" or "123"; null when the text is not a payment number. */
  static parse(text: string): number | null {
    const match = regularExpressions.paymentNumber.exec(text.trim());
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }
}
