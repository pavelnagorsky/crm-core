import { randomInt } from 'node:crypto';
import {
  PROMO_CODE_ALPHABET,
  PROMO_CODE_LENGTH,
} from '../constants/price-rule.constants.js';

/** A random promo code: 8 characters without the look-alikes 0/O and 1/I. */
export function randomPromoCode(next: (max: number) => number = randomInt): string {
  let code = '';
  for (let index = 0; index < PROMO_CODE_LENGTH; index += 1)
    code += PROMO_CODE_ALPHABET[next(PROMO_CODE_ALPHABET.length)];
  return code;
}
