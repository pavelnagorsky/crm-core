import { BookingStatus, ClientNoticeType } from '@prisma/client';
import { ClientNoticeBooking } from '../interfaces/client-notice-booking.interface.js';
import {
  CLIENT_NOTICE_DELAY_MS,
  clientRescheduleClientNotice,
  createdClientNotice,
  isClientNoticeSendable,
  NO_CLIENT_NOTICE,
  staffRescheduleClientNotice,
} from './booking-client-notice.rules.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const sendAt = new Date(now.getTime() + CLIENT_NOTICE_DELAY_MS);
const at = (iso: string) => new Date(iso);

function booking(overrides: Partial<ClientNoticeBooking> = {}) {
  return {
    status: BookingStatus.CONFIRMED,
    startAt: at('2026-09-21T10:00:00.000Z'),
    clientEmail: 'a@example.com',
    notifyClient: true,
    ...NO_CLIENT_NOTICE,
    ...overrides,
  } satisfies ClientNoticeBooking;
}

describe('createdClientNotice', () => {
  it('queues the confirmation after the undo window', () => {
    expect(createdClientNotice(booking(), now)).toEqual({
      clientNoticeAt: sendAt,
      clientNoticeType: ClientNoticeType.CREATED,
      clientNoticeFromStartAt: null,
    });
  });

  it.each([
    ['staff opted out', { notifyClient: false }],
    ['there is no email', { clientEmail: null }],
    ['the visit is already over', { status: BookingStatus.COMPLETED }],
    ['the visit is in the past', { startAt: at('2026-09-20T09:00:00Z') }],
  ])('queues nothing when %s', (_case, overrides) => {
    expect(createdClientNotice(booking(overrides), now)).toEqual(
      NO_CLIENT_NOTICE,
    );
  });
});

describe('staffRescheduleClientNotice', () => {
  const moved = (startAt: string, clientEmail: string | null = 'a@x.com') => ({
    startAt: at(startAt),
    clientEmail,
  });

  it('queues a move email from the old start', () => {
    expect(
      staffRescheduleClientNotice(
        booking(),
        moved('2026-09-22T10:00:00Z'),
        true,
        now,
      ),
    ).toEqual({
      clientNoticeAt: sendAt,
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-21T10:00:00.000Z'),
    });
  });

  it('keeps the first start and pushes the send time on another move', () => {
    const pending = booking({
      startAt: at('2026-09-22T10:00:00Z'),
      clientNoticeAt: at('2026-09-20T09:59:00Z'),
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-21T10:00:00Z'),
    });
    expect(
      staffRescheduleClientNotice(
        pending,
        moved('2026-09-23T10:00:00Z'),
        true,
        now,
      ),
    ).toEqual({
      clientNoticeAt: sendAt,
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-21T10:00:00Z'),
    });
  });

  it('drops the email when the booking is moved back to where it was', () => {
    const pending = booking({
      startAt: at('2026-09-22T10:00:00Z'),
      clientNoticeAt: at('2026-09-20T09:59:00Z'),
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-21T10:00:00Z'),
    });
    expect(
      staffRescheduleClientNotice(
        pending,
        moved('2026-09-21T10:00:00Z'),
        true,
        now,
      ),
    ).toEqual(NO_CLIENT_NOTICE);
  });

  it('keeps a pending creation email, delayed, so it carries the final time', () => {
    const created = booking({
      clientNoticeAt: at('2026-09-20T10:01:00Z'),
      clientNoticeType: ClientNoticeType.CREATED,
    });
    expect(
      staffRescheduleClientNotice(
        created,
        moved('2026-09-22T10:00:00Z'),
        false,
        now,
      ),
    ).toEqual({
      clientNoticeAt: sendAt,
      clientNoticeType: ClientNoticeType.CREATED,
      clientNoticeFromStartAt: null,
    });
  });

  it('leaves a pending move email alone when only staff or prices change', () => {
    const pending = booking({
      clientNoticeAt: at('2026-09-20T09:59:00Z'),
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-19T10:00:00Z'),
    });
    expect(
      staffRescheduleClientNotice(
        pending,
        moved('2026-09-21T10:00:00Z'),
        true,
        now,
      ),
    ).toEqual({
      clientNoticeAt: at('2026-09-20T09:59:00Z'),
      clientNoticeType: ClientNoticeType.RESCHEDULED,
      clientNoticeFromStartAt: at('2026-09-19T10:00:00Z'),
    });
  });

  it.each([
    ['the location turned it off', booking(), true, false],
    [
      'staff opted out at creation',
      booking({ notifyClient: false }),
      true,
      true,
    ],
    ['the email was removed in the same edit', booking(), false, true],
    [
      'the booking is no longer active',
      booking({ status: BookingStatus.NO_SHOW }),
      true,
      true,
    ],
  ])('queues nothing when %s', (_case, old, keepEmail, setting) => {
    expect(
      staffRescheduleClientNotice(
        old,
        moved('2026-09-22T10:00:00Z', keepEmail ? 'a@x.com' : null),
        setting,
        now,
      ),
    ).toEqual(NO_CLIENT_NOTICE);
  });

  it('queues nothing for a move into the past', () => {
    expect(
      staffRescheduleClientNotice(
        booking(),
        moved('2026-09-20T08:00:00Z'),
        true,
        now,
      ),
    ).toEqual(NO_CLIENT_NOTICE);
  });
});

describe('clientRescheduleClientNotice', () => {
  it('drops a pending staff move email, the client is told at once', () => {
    expect(
      clientRescheduleClientNotice(
        booking({
          clientNoticeAt: sendAt,
          clientNoticeType: ClientNoticeType.RESCHEDULED,
          clientNoticeFromStartAt: at('2026-09-21T09:00:00Z'),
        }),
      ),
    ).toEqual(NO_CLIENT_NOTICE);
  });

  it('keeps a pending creation email', () => {
    const created = {
      clientNoticeAt: sendAt,
      clientNoticeType: ClientNoticeType.CREATED,
      clientNoticeFromStartAt: null,
    };
    expect(clientRescheduleClientNotice(created)).toEqual(created);
  });
});

describe('isClientNoticeSendable', () => {
  const created = booking({
    clientNoticeAt: now,
    clientNoticeType: ClientNoticeType.CREATED,
  });
  const moved = booking({
    clientNoticeAt: now,
    clientNoticeType: ClientNoticeType.RESCHEDULED,
    clientNoticeFromStartAt: at('2026-09-21T08:00:00Z'),
  });

  it('sends a creation email regardless of the move setting', () => {
    expect(isClientNoticeSendable(created, false, now)).toBe(true);
  });

  it('sends a move email only while the location setting is on', () => {
    expect(isClientNoticeSendable(moved, true, now)).toBe(true);
    expect(isClientNoticeSendable(moved, false, now)).toBe(false);
  });

  it.each([
    ['no email', { clientEmail: null }],
    ['cancelled', { status: BookingStatus.CANCELLED }],
    ['started', { startAt: at('2026-09-20T09:00:00Z') }],
    ['opted out', { notifyClient: false }],
  ])('skips a booking that is %s', (_case, overrides) => {
    expect(
      isClientNoticeSendable({ ...created, ...overrides }, true, now),
    ).toBe(false);
  });

  it('skips a move email whose booking ended up at the original time', () => {
    expect(
      isClientNoticeSendable(
        { ...moved, clientNoticeFromStartAt: moved.startAt },
        true,
        now,
      ),
    ).toBe(false);
  });
});
