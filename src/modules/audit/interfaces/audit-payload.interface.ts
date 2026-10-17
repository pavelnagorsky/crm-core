import { BookingCancelledPayload } from './booking-cancelled-payload.interface.js';
import { BookingCreatedPayload } from './booking-created-payload.interface.js';
import { BookingDeletedPayload } from './booking-deleted-payload.interface.js';
import { BookingStatusChangedPayload } from './booking-status-changed-payload.interface.js';
import { BookingUpdatedPayload } from './booking-updated-payload.interface.js';
import { BrandUpdatedPayload } from './brand-updated-payload.interface.js';
import { ClientCreatedPayload } from './client-created-payload.interface.js';
import { ClientDeletedPayload } from './client-deleted-payload.interface.js';
import { ClientUpdatedPayload } from './client-updated-payload.interface.js';
import { PayrollPeriodAuditPayload } from './payroll-period-audit-payload.interface.js';
import { ProductPackagingAuditPayload } from './product-packaging-audit-payload.interface.js';
import { ServiceBundleCreatedPayload } from './service-bundle-created-payload.interface.js';
import { ServiceBundleDeletedPayload } from './service-bundle-deleted-payload.interface.js';
import { ServiceBundleUpdatedPayload } from './service-bundle-updated-payload.interface.js';
import { ServiceCategoryCreatedPayload } from './service-category-created-payload.interface.js';
import { ServiceCategoryDeletedPayload } from './service-category-deleted-payload.interface.js';
import { ServiceCategoryUpdatedPayload } from './service-category-updated-payload.interface.js';
import { ServiceCreatedPayload } from './service-created-payload.interface.js';
import { ServiceDeletedPayload } from './service-deleted-payload.interface.js';
import { ServiceUpdatedPayload } from './service-updated-payload.interface.js';
import { StaffBlockCreatedPayload } from './staff-block-created-payload.interface.js';
import { StaffCompensationUpdatedPayload } from './staff-compensation-updated-payload.interface.js';
import { StaffCreatedPayload } from './staff-created-payload.interface.js';
import { StaffDeletedPayload } from './staff-deleted-payload.interface.js';
import { StaffEarningAuditPayload } from './staff-earning-audit-payload.interface.js';
import { StaffShiftsUpdatedPayload } from './staff-shifts-updated-payload.interface.js';
import { StaffUpdatedPayload } from './staff-updated-payload.interface.js';

// ─── Union ───────────────────────────────────────────────────────────────────

export type AuditPayload =
  | ProductPackagingAuditPayload
  | BookingCreatedPayload
  | BookingUpdatedPayload
  | BookingCancelledPayload
  | BookingStatusChangedPayload
  | BookingDeletedPayload
  | ClientCreatedPayload
  | ClientUpdatedPayload
  | ClientDeletedPayload
  | StaffCreatedPayload
  | StaffUpdatedPayload
  | StaffDeletedPayload
  | StaffShiftsUpdatedPayload
  | StaffBlockCreatedPayload
  | StaffCompensationUpdatedPayload
  | StaffEarningAuditPayload
  | ServiceCreatedPayload
  | ServiceUpdatedPayload
  | ServiceDeletedPayload
  | ServiceCategoryCreatedPayload
  | ServiceCategoryUpdatedPayload
  | ServiceCategoryDeletedPayload
  | ServiceBundleCreatedPayload
  | ServiceBundleUpdatedPayload
  | ServiceBundleDeletedPayload
  | BrandUpdatedPayload
  | PayrollPeriodAuditPayload;
