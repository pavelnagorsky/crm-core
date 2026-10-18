import { HttpStatus } from '@nestjs/common';
import { BusinessRole } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { AccessManagementController } from './access-management.controller.js';

describe('Invitation link and email responses', () => {
  const management = {
    createInvitation: vi.fn(),
    invitationLink: vi.fn(),
    sendInvitationEmail: vi.fn(),
    link: vi.fn(),
  };
  const controller = new AccessManagementController(
    management as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const result = {
    token: 'original-token',
    invitation: {
      id: 'invitation',
      brandId: 'brand-1',
      issuerId: 'user-1',
      tokenHash: 'stored-hash',
      tokenEncrypted: 'stored-ciphertext',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      acceptedAt: null,
      revokedAt: null,
      grants: [
        {
          role: BusinessRole.STAFF,
          locationId: 'location-1',
          staffId: 'staff-1',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    management.createInvitation.mockResolvedValue(result);
    management.invitationLink.mockResolvedValue(result);
    management.link.mockReturnValue(
      'https://crm.example/invitation#token=original-token',
    );
  });

  it('returns the same response when creating and retrieving a link without leaking storage secrets', async () => {
    const created = await controller.createInvitation(
      tokenPayload(),
      'brand-1',
      { grants: [] },
    );
    const retrieved = await controller.invitationLink(
      tokenPayload(),
      'brand-1',
      'invitation',
    );
    expect(retrieved).toEqual(created);
    expect(retrieved.responseValue).toMatchObject({
      token: result.token,
      url: 'https://crm.example/invitation#token=original-token',
    });
    expect(retrieved.responseValue?.invitation).not.toHaveProperty('tokenHash');
    expect(retrieved.responseValue?.invitation).not.toHaveProperty(
      'tokenEncrypted',
    );
    expect(management.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('sends only the selected invitation and email in a separate request', async () => {
    const response = await controller.sendInvitationEmail(
      tokenPayload(),
      'brand-1',
      'invitation',
      { email: 'member@example.com' },
    );
    expect(management.sendInvitationEmail).toHaveBeenCalledExactlyOnceWith(
      tokenPayload(),
      'brand-1',
      'invitation',
      'member@example.com',
    );
    expect(response.responseValue).toEqual({ id: 'invitation' });
    expect(management.createInvitation).not.toHaveBeenCalled();
  });

  it('propagates email failures while keeping link retrieval available', async () => {
    const failure = new AppException(
      ErrorCode.EMAIL_DELIVERY_FAILED,
      HttpStatus.BAD_GATEWAY,
    );
    management.sendInvitationEmail.mockRejectedValue(failure);
    await expect(
      controller.sendInvitationEmail(tokenPayload(), 'brand-1', 'invitation', {
        email: 'member@example.com',
      }),
    ).rejects.toBe(failure);
    expect(
      (await controller.invitationLink(tokenPayload(), 'brand-1', 'invitation'))
        .responseValue?.token,
    ).toBe(result.token);
  });
});
