/**
 * Batched inputs shared across staff KPI cards, so overlapping cards reuse the same queries.
 * Fields default to 0 when no requested card needs them.
 */
export interface StaffWidgetContext {
  activeCount: number;
  deactivatedRecentlyCount: number;
  staffWithShiftsCount: number;
  coveredServicesCount: number;
  activeServicesCount: number;
}
