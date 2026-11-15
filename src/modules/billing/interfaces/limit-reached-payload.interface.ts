import { UsageResource } from '../enums/usage-resource.enum.js';

/** responseValue of PLAN_STAFF_LIMIT_REACHED and PLAN_LOCATION_LIMIT_REACHED. */
export interface LimitReachedPayload {
  resource: UsageResource;
  limit: number;
  used: number;
  planCode: string | null;
  /** Nearest public standard plan with a price that fits used + 1; null means a custom plan. */
  suggestedPlanCode: string | null;
}
