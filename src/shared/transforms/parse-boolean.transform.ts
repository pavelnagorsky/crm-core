import { Transform } from 'class-transformer';

export const ParseBoolean = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    if (value === '') return value;
    return value.toLowerCase() === 'true';
  });
