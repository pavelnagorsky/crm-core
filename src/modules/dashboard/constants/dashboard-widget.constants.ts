import { BookingStatus } from '@prisma/client';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';
export const REVENUE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

export const CANCELLATION_DENOMINATOR: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

export const NO_SHOW_DENOMINATOR: BookingStatus[] = [
  BookingStatus.NO_SHOW,
  BookingStatus.COMPLETED,
];

export const COMPLETION_DENOMINATOR: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CONFIRMED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.PENDING,
];

export const DEFAULT_TOP_N = 5;

export const BOOKING_SNAPSHOT_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.AVG_TICKET,
  DashboardWidgetKey.BOOKINGS_TOTAL,
  DashboardWidgetKey.BOOKINGS_COMPLETED,
  DashboardWidgetKey.BOOKINGS_CANCELLED,
  DashboardWidgetKey.BOOKINGS_NO_SHOW,
  DashboardWidgetKey.BOOKINGS_PENDING,
  DashboardWidgetKey.CANCELLATION_RATE,
  DashboardWidgetKey.NO_SHOW_RATE,
  DashboardWidgetKey.COMPLETION_RATE,
]);

export const BOOKING_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.REVENUE_SERIES,
  DashboardWidgetKey.BOOKINGS_TOTAL,
  DashboardWidgetKey.BOOKINGS_COMPLETED,
  DashboardWidgetKey.BOOKINGS_CANCELLED,
  DashboardWidgetKey.BOOKINGS_NO_SHOW,
  DashboardWidgetKey.BOOKINGS_PENDING,
  DashboardWidgetKey.BOOKINGS_SERIES,
]);

export const PREVIOUS_BOOKING_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_SERIES,
  DashboardWidgetKey.BOOKINGS_SERIES,
]);

export const PRODUCT_SNAPSHOT_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.AVG_TICKET,
]);

export const PRODUCT_SERIES_KEYS = new Set<DashboardWidgetKey>([
  DashboardWidgetKey.REVENUE_TOTAL,
  DashboardWidgetKey.REVENUE_COMPLETED,
  DashboardWidgetKey.REVENUE_SERIES,
]);
