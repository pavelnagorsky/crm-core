import sanitizeHtml from 'sanitize-html';
import regularExpressions from '../../../shared/regular-expressions.js';

export function trimContact(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() || null : value;
}

export function normalizeMapWidgetUrl(value: unknown): unknown {
  const trimmed = trimContact(value);
  if (
    typeof trimmed !== 'string' ||
    !regularExpressions.iframeStart.test(trimmed)
  ) {
    return trimmed;
  }

  const sources: (string | undefined)[] = [];
  sanitizeHtml(trimmed, {
    transformTags: {
      iframe: (tagName, attribs) => {
        sources.push(attribs.src);
        return { tagName, attribs };
      },
    },
  });
  return sources.length === 1 && sources[0]?.trim()
    ? sources[0].trim()
    : trimmed;
}
