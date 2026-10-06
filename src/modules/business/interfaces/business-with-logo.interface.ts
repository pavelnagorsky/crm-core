import { BookingVisibility, Brand, File } from '@prisma/client';

export interface BusinessWithLogo extends Brand {
  logoFile: File | null;
  advanceBookingWindowDays?: number;
  slotIntervalMinutes?: number;
  minimumBookingNoticeMinutes?: number;
  timezone?: string;
  currency?: string;
  bookingVisibility?: BookingVisibility;
  isBookingConfirmationRequired?: boolean;
}
