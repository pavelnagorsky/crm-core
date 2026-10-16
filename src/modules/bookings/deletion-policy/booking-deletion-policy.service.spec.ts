import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingDeletionPolicyService } from './booking-deletion-policy.service.js';

describe('BookingDeletionPolicyService', () => {
  const count = vi.fn();
  const tx = { booking: { count } } as unknown as Prisma.TransactionClient;
  const policy = new BookingDeletionPolicyService();

  beforeEach(() => vi.resetAllMocks());

  describe.each([
    'assertLocationDeletionAllowed',
    'assertBrandDeletionAllowed',
  ] as const)('%s', (method) => {
    it('allows deletion when no open bookings remain', async () => {
      count.mockResolvedValue(0);
      await expect(policy[method]('business', tx)).resolves.toBeUndefined();
    });

    it('returns the conflict code and exact number of blocking bookings', async () => {
      count.mockResolvedValue(3);
      const error = await policy[method]('business', tx).catch(
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({
        errorCode: ErrorCode.BUSINESS_HAS_OPEN_BOOKINGS.code,
        message: ErrorCode.BUSINESS_HAS_OPEN_BOOKINGS.message,
        payload: { openBookingsCount: 3 },
      });
      expect((error as AppException).getStatus()).toBe(409);
    });

    it('does not permit deletion when the booking check fails', async () => {
      const error = new Error('Database unavailable');
      count.mockRejectedValue(error);
      await expect(policy[method]('business', tx)).rejects.toBe(error);
    });
  });
});
