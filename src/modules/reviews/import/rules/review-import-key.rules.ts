import { createHash } from 'crypto';
import regularExpressions from '../../../../shared/regular-expressions.js';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(new RegExp(regularExpressions.whitespace, 'g'), ' ')
    .trim();

/**
 * Dedup key of an imported review, unique per location. The id from the old system wins;
 * otherwise a hash of author, date, rating and text, so identical rows collapse into one.
 */
export function reviewImportKey(review: {
  id: string | null;
  author: string;
  dateKey: string;
  rating: number;
  text: string;
}): string {
  if (review.id) return `id:${review.id}`;
  const content = [
    normalize(review.author),
    review.dateKey,
    String(review.rating),
    normalize(review.text),
  ].join('|');
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
