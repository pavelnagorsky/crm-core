import { TrafficClassification } from './traffic-classification.interface.js';
import { TrafficTouchRecord } from './traffic-touch-record.interface.js';

/** Classified source of an online visit plus the evidence to store; touch is null for a direct visit. */
export interface ClassifiedTraffic extends TrafficClassification {
  touch: TrafficTouchRecord | null;
}
