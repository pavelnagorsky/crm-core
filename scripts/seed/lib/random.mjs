// Deterministic seeded RNG (mulberry32) so repeated seed runs produce the same data.

export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** Float in [0, 1). */
    float: next,
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    /** Returns true with probability p (0..1). */
    chance(p) {
      return next() < p;
    },
    /** Uniformly picks one element. */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /**
     * Weighted pick. `items` is an array of [value, weight] pairs.
     */
    weighted(items) {
      const total = items.reduce((sum, [, w]) => sum + w, 0);
      let r = next() * total;
      for (const [value, weight] of items) {
        r -= weight;
        if (r < 0) return value;
      }
      return items[items.length - 1][0];
    },
    /** In-place Fisher–Yates shuffle (returns the same array). */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
