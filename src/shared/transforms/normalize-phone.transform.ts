import { Transform } from 'class-transformer';
import { canonicalPhone } from '../phone/canonical-phone.js';

export const NormalizePhone = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return canonicalPhone(value) || value;
  });
