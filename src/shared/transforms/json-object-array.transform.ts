import { BadRequestException } from '@nestjs/common';
import {
  ClassConstructor,
  plainToInstance,
  Transform,
} from 'class-transformer';

export const JSON_OBJECT_ARRAY_MAX_LENGTH = 4096;

/** Parses bounded JSON query arrays before nested DTO validation. */
export function JsonObjectArray<T extends object>(
  type: ClassConstructor<T>,
  maxItems: number,
): PropertyDecorator {
  return Transform(
    ({ value, key }) => {
      if (value === undefined) return value;
      if (
        typeof value !== 'string' ||
        value.length > JSON_OBJECT_ARRAY_MAX_LENGTH
      ) {
        throw new BadRequestException(
          `${key} must be a JSON array, at most ${JSON_OBJECT_ARRAY_MAX_LENGTH} characters`,
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new BadRequestException(`${key} must be a valid JSON array`);
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length > maxItems ||
        parsed.some(
          (item) => !item || typeof item !== 'object' || Array.isArray(item),
        )
      ) {
        throw new BadRequestException(
          `${key} must contain at most ${maxItems} assignment objects`,
        );
      }
      return plainToInstance(type, parsed);
    },
    { toClassOnly: true },
  );
}
