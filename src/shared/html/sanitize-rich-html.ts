import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  parseStyleAttributes: false,
  exclusiveFilter: (frame) => frame.tag === 'script',
  transformTags: {
    '*': (tagName, attribs) => {
      for (const name of Object.keys(attribs)) {
        if (name.startsWith('on') && name !== 'open' && name !== 'optimum') {
          delete attribs[name];
        }
      }
      return { tagName, attribs };
    },
  },
};

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
