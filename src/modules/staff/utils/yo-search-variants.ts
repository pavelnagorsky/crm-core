const YO_VARIANTS_LIMIT = 4;

export function yoSearchVariants(term: string): string[] {
  const chars = [...term.toLowerCase()];
  const indexes = chars.flatMap((char, index) =>
    char === 'е' || char === 'ё' ? [index] : [],
  );
  if (indexes.length === 0) return [chars.join('')];

  const varied = indexes.slice(0, YO_VARIANTS_LIMIT);
  const variants: string[] = [];
  const count = 1 << varied.length;
  for (let mask = 0; mask < count; mask += 1) {
    const next = chars.slice();
    varied.forEach((index, bit) => {
      next[index] = mask & (1 << bit) ? 'ё' : 'е';
    });
    variants.push(next.join(''));
  }
  return [...new Set(variants)];
}
