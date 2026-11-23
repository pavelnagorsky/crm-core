import { Prisma } from '@prisma/client';
import { CacheValueCodec } from './cache-value.codec.js';

describe('CacheValueCodec', () => {
  const roundTrip = <T>(value: T): T =>
    CacheValueCodec.decode<T>(CacheValueCodec.encode(value));

  it('keeps Date, Decimal and bigint at any depth', () => {
    const decoded = roundTrip({
      at: new Date('2026-11-04T12:42:10.123Z'),
      items: [
        { price: new Prisma.Decimal('12.30'), size: 9_007_199_254_740_993n },
      ],
      nested: { dates: [new Date('2026-01-01T00:00:00Z')] },
    });

    expect(decoded.at).toBeInstanceOf(Date);
    expect(decoded.at.toISOString()).toBe('2026-11-04T12:42:10.123Z');
    expect(Prisma.Decimal.isDecimal(decoded.items[0].price)).toBe(true);
    expect(decoded.items[0].price.plus(1).toFixed(2)).toBe('13.30');
    expect(decoded.items[0].size).toBe(9_007_199_254_740_993n);
    expect(decoded.nested.dates[0]).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('keeps top-level values and plain JSON as is', () => {
    expect(roundTrip(new Date('2026-01-01T00:00:00Z'))).toEqual(
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(roundTrip(new Prisma.Decimal('0.1')).toString()).toBe('0.1');
    expect(roundTrip(5n)).toBe(5n);
    const plain = { a: 1, b: 'text', c: null, d: [true, { e: 'x' }] };
    expect(roundTrip(plain)).toEqual(plain);
  });

  it('builds new objects on every decode', () => {
    const payload = CacheValueCodec.encode({
      at: new Date('2026-01-01T00:00:00Z'),
      list: [{ id: 1 }],
    });
    const a = CacheValueCodec.decode<{ at: Date; list: { id: number }[] }>(
      payload,
    );
    const b = CacheValueCodec.decode<{ at: Date; list: { id: number }[] }>(
      payload,
    );

    a.at.setUTCFullYear(2000);
    a.list[0].id = 2;
    expect(b.at.getUTCFullYear()).toBe(2026);
    expect(b.list[0].id).toBe(1);
  });

  it('does not treat ordinary single-key objects as tagged values', () => {
    const value = { name: 'x', nested: { id: 'y' }, count: { total: 1 } };
    expect(roundTrip(value)).toEqual(value);
  });
});
