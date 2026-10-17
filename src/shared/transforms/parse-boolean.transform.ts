import { Transform } from 'class-transformer';

export const ParseBoolean = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    // Leave invalid input intact so @IsBoolean rejects it instead of silently filtering by false.
    return value;
  });
