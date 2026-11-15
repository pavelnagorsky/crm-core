export interface TrialEligibility {
  eligible: boolean;
  /** Brand where the trial was spent, including deleted ones. */
  usedInBrandName: string | null;
}
