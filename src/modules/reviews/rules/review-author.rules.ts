import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ReviewableBooking } from '../interfaces/reviewable-booking.interface.js';
import { ReviewWithStaff } from '../interfaces/review-with-staff.interface.js';

/** "Анна К." — first name plus last-name initial; null when the author is unknown. */
export function maskAuthorName(
  review: Pick<ReviewWithStaff, 'authorFirstName' | 'authorLastName'>,
): string | null {
  const first = review.authorFirstName?.trim();
  const lastInitial = Array.from(review.authorLastName?.trim() ?? '')[0];
  const parts = [first, lastInitial ? `${lastInitial.toUpperCase()}.` : null];
  return parts.filter(Boolean).join(' ') || null;
}

export function authorSnapshot(
  value: string | null | undefined,
): string | null {
  return value?.trim() || null;
}

export function clientAuditActor(
  booking: Pick<
    ReviewableBooking,
    'clientId' | 'clientFirstName' | 'clientLastName'
  >,
): AuditActor {
  return {
    id: booking.clientId ?? undefined,
    name: `${booking.clientFirstName} ${booking.clientLastName}`.trim(),
    role: AuditActorRole.CLIENT,
  };
}
