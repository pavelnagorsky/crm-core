import { StaffShiftAuditItem } from './staff-shift-audit-item.interface.js';

export interface StaffShiftsUpdatedPayload {
  startDate: string;
  endDate: string;
  before?: StaffShiftAuditItem[];
  after?: StaffShiftAuditItem[];
}
