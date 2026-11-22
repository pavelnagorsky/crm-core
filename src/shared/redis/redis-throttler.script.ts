/*
 * Lua script of RedisThrottlerStorage: a fixed-window counter with an optional block, in one atomic step so
 * that replicas sharing a key cannot both pass the last allowed hit.
 *
 * KEYS[1] hit counter, KEYS[2] block marker (its value is the hit count that triggered the block).
 * ARGV[1] window (ms), ARGV[2] limit, ARGV[3] block duration (ms, 0 = no block).
 * Returns {totalHits, windowPttl, blocked (0/1), blockPttl}; times are in milliseconds.
 *
 * Mirrors the built-in ThrottlerStorageService:
 * - while blocked, hits are not counted;
 * - with a block duration, the hit over the limit starts the block, and the count restarts after it ends;
 * - without one, the hit over the limit is rejected and not counted until the window ends.
 */
export const THROTTLER_INCREMENT_SCRIPT = String.raw`
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local blockPttl = redis.call('PTTL', KEYS[2])
if blockPttl > 0 then
  return {tonumber(redis.call('GET', KEYS[2]) or '0'), blockPttl, 1, blockPttl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], window)
end
local windowPttl = redis.call('PTTL', KEYS[1])
if windowPttl < 0 then
  redis.call('PEXPIRE', KEYS[1], window)
  windowPttl = window
end
if hits <= limit then
  return {hits, windowPttl, 0, 0}
end
if blockDuration > 0 then
  redis.call('SET', KEYS[2], hits, 'PX', blockDuration)
  redis.call('DEL', KEYS[1])
  return {hits, windowPttl, 1, blockDuration}
end
redis.call('DECR', KEYS[1])
return {hits, windowPttl, 1, windowPttl}
`;
