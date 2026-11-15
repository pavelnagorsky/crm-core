import { BillingActor } from './billing-actor.interface.js';

/** Extension without payment: exactly one of `days` and `until` (YYYY-MM-DD, exclusive). */
export interface ComplimentaryExtensionInput {
  days?: number;
  until?: string;
  reason: string;
  actor: BillingActor;
}
