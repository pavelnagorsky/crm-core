/*
 * Lua script of RedisThrottlerStorage, in one atomic step so that replicas sharing a key cannot both pass the last
 * allowed hit.
 *
 * Counts like the built-in ThrottlerStorageService: every hit lives for its own `ttl` (a sorted set scored by the
 * moment each hit expires), so there is no window boundary where up to 2x the limit could pass.
 * - while blocked, hits are not counted;
 * - with a block duration, the hit over the limit starts the block, and the count restarts after it ends;
 * - without one, the hit over the limit is rejected and not counted until the oldest hit expires.
 *
 * KEYS[1] hits (sorted set: member — unique hit id, score — when the hit expires, ms), KEYS[2] block marker (its
 * value is the hit count that triggered the block).
 * ARGV[1] now (ms), ARGV[2] ttl (ms), ARGV[3] limit, ARGV[4] block duration (ms, 0 = no block), ARGV[5] hit id.
 * Returns {totalHits, msUntilOldestHitExpires, blocked (0/1), blockPttl}; times are in milliseconds.
 *
 * Needs a single Redis node (or a primary with replicas): the two keys of one counter are in different hash slots,
 * so Redis Cluster would reject the script with CROSSSLOT.
 */
export const THROTTLER_INCREMENT_SCRIPT = String.raw`
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])
local blockPttl = redis.call('PTTL', KEYS[2])
if blockPttl > 0 then
  return {tonumber(redis.call('GET', KEYS[2]) or '0'), blockPttl, 1, blockPttl}
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local function untilOldestExpires()
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if oldest[2] then
    return tonumber(oldest[2]) - now
  end
  return ttl
end
local hits = redis.call('ZCARD', KEYS[1])
if blockDuration <= 0 and hits >= limit then
  local wait = untilOldestExpires()
  return {hits + 1, wait, 1, wait}
end
redis.call('ZADD', KEYS[1], now + ttl, ARGV[5])
redis.call('PEXPIRE', KEYS[1], ttl)
hits = hits + 1
local windowPttl = untilOldestExpires()
if hits > limit then
  redis.call('SET', KEYS[2], hits, 'PX', blockDuration)
  redis.call('DEL', KEYS[1])
  return {hits, windowPttl, 1, blockDuration}
end
return {hits, windowPttl, 0, 0}
`;
