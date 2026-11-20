import { Transform } from 'class-transformer';

/** Keeps a JSON object for a nested DTO; a string, array or number becomes undefined instead of a 400. */
export const PlainObjectOrUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : undefined,
  );
