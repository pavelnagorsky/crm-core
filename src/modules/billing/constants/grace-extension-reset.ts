/** A new access end makes the grace extension of the old one meaningless (plan section 4.2). */
export const GRACE_EXTENSION_RESET = {
  graceExtendedUntil: null,
  graceExtendedFor: null,
} as const;
