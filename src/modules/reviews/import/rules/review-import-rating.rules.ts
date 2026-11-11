import regularExpressions from '../../../../shared/regular-expressions.js';
import { XlsxCellValue } from '../../../../shared/xlsx/interfaces/xlsx-cell-value.interface.js';
import {
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
} from '../../constants/reviews.constants.js';

/** Whole rating 1–5 from a number or text like `5`, `5.0`, `5 звёзд`; null otherwise. */
export function parseImportRating(value: XlsxCellValue): number | null {
  let rating: number;
  if (typeof value === 'number') rating = value;
  else if (typeof value === 'string') {
    const match = regularExpressions.reviewRatingText.exec(value.trim());
    if (!match) return null;
    rating = Number(match[1]);
  } else return null;

  return Number.isInteger(rating) &&
    rating >= REVIEW_RATING_MIN &&
    rating <= REVIEW_RATING_MAX
    ? rating
    : null;
}
