/*
 * Lua scripts of RedisCacheStore. Each runs atomically, so a check and the following write cannot be split
 * by an invalidation from another replica.
 *
 * Keys: the entry and the global revision come in KEYS. Tag keys depend on the entry contents and cannot be
 * passed in advance, so they are built inside the scripts as ARGV[1] (the tag prefix, `crm:cache:tag:`)
 * plus the dependency. All keys share the `crm:` prefix; ioredis `keyPrefix` is not used for that reason.
 *
 * Entry hash: `r` — global revision when its load started, `d` — dependencies joined with "\n", `v` — payload.
 * A missing revision or tag counts as 0.
 */

/**
 * KEYS[1] entry, KEYS[2] revision; ARGV[1] tag prefix.
 * Returns `{current}` on a miss or `{current, payload, pttl}` on a hit. A stale entry is deleted: one of its
 * tags is newer than the entry, or the entry is newer than the counter (Redis lost the counter but kept data).
 */
export const CACHE_READ_SCRIPT = String.raw`
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
local entry = redis.call('HMGET', KEYS[1], 'r', 'd', 'v')
if not entry[1] or not entry[3] then
  return {current}
end
local revision = tonumber(entry[1])
local stale = revision > current
if not stale and entry[2] then
  for dependency in string.gmatch(entry[2], '[^\n]+') do
    if tonumber(redis.call('GET', ARGV[1] .. dependency) or '0') > revision then
      stale = true
      break
    end
  end
end
if stale then
  redis.call('DEL', KEYS[1])
  return {current}
end
return {current, entry[3], redis.call('PTTL', KEYS[1])}
`;

/**
 * KEYS[1] entry, KEYS[2] revision; ARGV[1] tag prefix, ARGV[2] load revision, ARGV[3] dependencies joined
 * with "\n", ARGV[4] payload, ARGV[5] TTL in ms.
 * Returns 0 without writing when the load is stale (a tag was invalidated after it started, or the counter is
 * behind it), otherwise replaces the entry and returns 1.
 */
export const CACHE_WRITE_SCRIPT = String.raw`
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
local revision = tonumber(ARGV[2])
if revision > current then
  return 0
end
for dependency in string.gmatch(ARGV[3], '[^\n]+') do
  if tonumber(redis.call('GET', ARGV[1] .. dependency) or '0') > revision then
    return 0
  end
end
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], 'r', ARGV[2], 'd', ARGV[3], 'v', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`;

/** KEYS[1] revision, KEYS[2] tag. Neither has a TTL: `volatile-lru` must never evict them. */
export const CACHE_INVALIDATE_SCRIPT = String.raw`
local revision = redis.call('INCR', KEYS[1])
redis.call('SET', KEYS[2], revision)
return revision
`;
