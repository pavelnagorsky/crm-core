import { Transform } from 'class-transformer';
import { sanitizeTouchedAt } from '../traffic/rules/traffic-sanitize.rules.js';

/** An ISO moment within the attribution window as a Date; anything else becomes undefined. */
export const SanitizeTouchedAt = () =>
  Transform(({ value }: { value: unknown }) => sanitizeTouchedAt(value));
