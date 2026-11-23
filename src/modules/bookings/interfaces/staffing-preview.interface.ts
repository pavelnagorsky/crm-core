/** Who can take a visit at a local start, and who the location rule would give. */
export interface StaffingPreview {
  /** Active staff who perform every service of the visit. */
  qualifiedStaffIds: string[];
  /** Qualified staff free for the whole visit. */
  freeStaffIds: string[];
  /** The staff asked for, else the free staff member the "any staff" rule ranks first; null when nobody is free. */
  assignedStaffId: string | null;
}
