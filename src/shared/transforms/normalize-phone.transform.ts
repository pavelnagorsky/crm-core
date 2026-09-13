import { Transform } from 'class-transformer';

/**
 * Strips all non-digit characters, then prepends '+'.
 * "375 29 233-20-00" → "+375292332000"
 * Already-normalized "+375292332000" → "+375292332000"
 */
export const NormalizePhone = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const digits = value.replace(/\D/g, '');
    return digits ? `+${digits}` : value;
  });
