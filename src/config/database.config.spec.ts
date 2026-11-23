import { databasePoolSize } from './database.config.js';

describe('databasePoolSize', () => {
  it('defaults to 10', () => {
    expect(databasePoolSize({})).toBe(10);
    expect(databasePoolSize({ DATABASE_POOL_SIZE: ' ' })).toBe(10);
  });

  it('reads the configured size', () => {
    expect(databasePoolSize({ DATABASE_POOL_SIZE: '5' })).toBe(5);
    expect(databasePoolSize({ DATABASE_POOL_SIZE: ' 20 ' })).toBe(20);
  });

  it.each(['0', '-1', '2.5', 'ten'])('rejects %s', (value) => {
    expect(() => databasePoolSize({ DATABASE_POOL_SIZE: value })).toThrow(
      `DATABASE_POOL_SIZE must be a positive integer, got "${value}"`,
    );
  });
});
