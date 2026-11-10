import sanitizeHtml from 'sanitize-html';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
};
const MAX_PASSES = 3;

function stripTags(value: string): string {
  // sanitize-html decodes entities and escapes `& < > "` again; one decode pass restores plain text.
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).replace(/&(amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name]);
}

/**
 * Reviews are public plain text: every HTML tag is dropped, the rest is stored as typed.
 * Stripping repeats until stable so entity-encoded tags (`&lt;b&gt;`) cannot survive decoding.
 */
export function sanitizeReviewText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let text = value;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = stripTags(text);
    if (next === text) break;
    text = next;
  }
  return (
    text
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
