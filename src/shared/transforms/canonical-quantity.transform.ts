import { Transform } from 'class-transformer';
import { QuantityService } from '../quantity/quantity.service.js';

export const CanonicalQuantity = () =>
  Transform(({ value }) => QuantityService.canonical(value));
