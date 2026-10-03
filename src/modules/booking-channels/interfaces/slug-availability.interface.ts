import { SlugAvailabilityReason } from '../enums/slug-availability-reason.enum.js';

export interface SlugAvailability {
  isAvailable: boolean;
  reason: SlugAvailabilityReason | null;
}
