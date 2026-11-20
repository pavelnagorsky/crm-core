import { EmailChipTone } from '../../enums/email-chip-tone.enum.js';
import { EmailChipColors } from '../../interfaces/email-chip-colors.interface.js';

/** Chip tone per template, or per `template.variant` when the variants differ. */
export const EMAIL_CHIP_TONES: Record<string, EmailChipTone> = {
  'access-invitation': EmailChipTone.SUCCESS,
  'booking-pending': EmailChipTone.WARNING,
  'booking-confirmed': EmailChipTone.SUCCESS,
  'booking-status-changed.CONFIRMED': EmailChipTone.SUCCESS,
  'booking-status-changed.RESCHEDULED': EmailChipTone.INFO,
  'booking-status-changed.CANCELLED': EmailChipTone.ERROR,
  'booking-reminder': EmailChipTone.SECONDARY,
  'review-request': EmailChipTone.SUCCESS,
  'staff-booking-event.CREATED': EmailChipTone.SUCCESS,
  'staff-booking-event.REQUESTED': EmailChipTone.WARNING,
  'staff-booking-event.RESCHEDULED': EmailChipTone.INFO,
  'staff-booking-event.CANCELLED': EmailChipTone.ERROR,
  'subscription-trial-ending': EmailChipTone.WARNING,
  'subscription-period-ending': EmailChipTone.WARNING,
  'subscription-access-ended': EmailChipTone.ERROR,
  'subscription-access-limited': EmailChipTone.ERROR,
  'subscription-payment-requested': EmailChipTone.INFO,
  'subscription-payment-received': EmailChipTone.SUCCESS,
  'admin-subscription-payment-requested': EmailChipTone.INFO,
  'smtp-test': EmailChipTone.SUCCESS,
};

/** Klendo product palette: "lighter" background with "dark" text. */
export const EMAIL_CHIP_COLORS: Record<EmailChipTone, EmailChipColors> = {
  [EmailChipTone.SUCCESS]: { background: '#DBF6E5', color: '#007867' },
  [EmailChipTone.WARNING]: { background: '#FFF5CC', color: '#B76E00' },
  [EmailChipTone.INFO]: { background: '#D6F4F9', color: '#006C9C' },
  [EmailChipTone.ERROR]: { background: '#FFE9D5', color: '#B71D18' },
  [EmailChipTone.SECONDARY]: { background: '#EFD6FF', color: '#5119B7' },
};
