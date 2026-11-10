import regularExpressions from '../../../shared/regular-expressions.js';

function hasReviewTarget(value: unknown, target: RegExp): boolean {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return false;
  }
  return target.test(`${url.hostname}${url.pathname}`);
}

export function isGoogleReviewUrl(value: unknown): boolean {
  return hasReviewTarget(value, regularExpressions.googleReviewTarget);
}

export function isYandexReviewUrl(value: unknown): boolean {
  return hasReviewTarget(value, regularExpressions.yandexReviewTarget);
}
