import { UsageCheck } from './usage-check.interface.js';

/** responseValue of PLAN_USAGE_EXCEEDS_LIMITS. */
export interface UsageExceedsPayload {
  staff: UsageCheck;
  locations: UsageCheck;
}
