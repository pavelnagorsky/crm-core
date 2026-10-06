import { Transform } from 'class-transformer';

export const ToArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;

    const items = Array.isArray(value) ? value : [value];
    const nonEmptyItems = items.filter(
      (item) => item !== undefined && item !== null && item !== '',
    );

    return nonEmptyItems.length ? nonEmptyItems : undefined;
  });
