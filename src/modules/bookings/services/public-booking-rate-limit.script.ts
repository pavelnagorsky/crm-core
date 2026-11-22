/**
 * Lua script of PublicBookingRateLimiter: a sliding window on a sorted set of attempt timestamps, atomic so
 * that replicas cannot both pass the last allowed attempt.
 *
 * KEYS[1] attempts of one phone or IP. ARGV[1] now (ms), ARGV[2] window (ms), ARGV[3] limit,
 * ARGV[4] unique member (two attempts in the same millisecond must not merge).
 * Returns 1 when the attempt is allowed and recorded, 0 when the limit is reached (the attempt is not recorded).
 */
export const PUBLIC_BOOKING_RATE_LIMIT_SCRIPT = String.raw`
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 1
`;
