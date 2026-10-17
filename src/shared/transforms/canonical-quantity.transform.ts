import { Transform } from 'class-transformer';
import { QuantityUtils } from '../quantity/quantity.utils.js';

export const CanonicalQuantity = () =>
  Transform(({ value }) => QuantityUtils.canonical(value));
