import { EmailAudience, EmailStatus } from '@prisma/client';
import { EmailRetryBlock } from '../enums/email-retry-block.enum.js';
import { classifyEmailError } from '../utils/classify-email-error.js';
import { emailRetryBlock, isEmailCancellable } from './email-actions.rules.js';

const now = new Date('2026-11-20T12:00:00Z');
const email = (overrides = {}) => ({
  payload: {},
  status: EmailStatus.FAILED,
  validUntil: null,
  audience: EmailAudience.CLIENT,
  ...overrides,
});

describe('emailRetryBlock', () => {
  it('allows failed, cancelled, skipped and even sent emails', () => {
    for (const status of [
      EmailStatus.FAILED,
      EmailStatus.CANCELLED,
      EmailStatus.SKIPPED,
      EmailStatus.SENT,
    ])
      expect(emailRetryBlock(email({ status }), true, now)).toBeNull();
  });

  it.each([
    [{ payload: null }, true, EmailRetryBlock.NOT_STORED],
    [{ status: EmailStatus.RETRYING }, true, EmailRetryBlock.IN_PROGRESS],
    [
      { validUntil: new Date('2026-11-20T11:00:00Z') },
      true,
      EmailRetryBlock.OUTDATED,
    ],
    [{}, false, EmailRetryBlock.CLIENT_NOTIFICATIONS_DISABLED],
  ])(
    'blocks %o (client emails on: %s) with %s',
    (overrides, enabled, block) => {
      expect(emailRetryBlock(email(overrides), enabled, now)).toBe(block);
    },
  );

  it('lets account emails through while client emails are muted', () => {
    expect(
      emailRetryBlock(email({ audience: EmailAudience.ACCOUNT }), false, now),
    ).toBeNull();
  });
});

describe('isEmailCancellable', () => {
  it('cancels only waiting or failed emails', () => {
    expect(isEmailCancellable({ status: EmailStatus.RETRYING })).toBe(true);
    expect(isEmailCancellable({ status: EmailStatus.FAILED })).toBe(true);
    expect(isEmailCancellable({ status: EmailStatus.SENDING })).toBe(false);
    expect(isEmailCancellable({ status: EmailStatus.SENT })).toBe(false);
  });
});

describe('classifyEmailError', () => {
  it('treats an authentication failure as ours to fix: retry', () => {
    expect(
      classifyEmailError(
        Object.assign(new Error('Invalid login'), { responseCode: 535 }),
      ),
    ).toEqual({ message: 'Invalid login', code: 535, permanent: false });
  });

  it('gives up on rejected recipients and bad envelopes', () => {
    expect(
      classifyEmailError(Object.assign(new Error('x'), { responseCode: 550 }))
        .permanent,
    ).toBe(true);
    expect(
      classifyEmailError(Object.assign(new Error('x'), { code: 'EENVELOPE' }))
        .permanent,
    ).toBe(true);
  });
});
