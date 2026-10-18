import { ConfigService } from '@nestjs/config';
import { AccessInvitationTokenService } from './access-invitation-token.service.js';

describe('Recoverable invitation tokens', () => {
  const createService = (secret = 'test-email-secret') =>
    new AccessInvitationTokenService(
      new ConfigService({ jwt: { emailTokenSecret: secret } }),
    );

  it('restores the same random token after recreating the service', () => {
    const issued = createService().create();
    expect(issued.token).toHaveLength(64);
    expect(issued.tokenEncrypted).not.toContain(issued.token);
    expect(issued.tokenHash).not.toBe(issued.token);
    expect(issued.tokenEncrypted.length).toBeLessThanOrEqual(160);
    expect(createService().restore(issued)).toBe(issued.token);
    expect(createService().hash(issued.token)).toBe(issued.tokenHash);
  });

  it('issues independent tokens for new invitations', () => {
    const tokens = createService();
    const first = tokens.create();
    const second = tokens.create();
    expect(second.token).not.toBe(first.token);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it('rejects tampered ciphertext', () => {
    const tokens = createService();
    const issued = tokens.create();
    const encrypted = Buffer.from(issued.tokenEncrypted, 'base64url');
    encrypted[30] ^= 1;
    expect(() =>
      tokens.restore({
        ...issued,
        tokenEncrypted: encrypted.toString('base64url'),
      }),
    ).toThrow();
  });

  it('binds the encrypted token to its hash', () => {
    const tokens = createService();
    const first = tokens.create();
    const second = tokens.create();
    expect(() =>
      tokens.restore({ ...first, tokenHash: second.tokenHash }),
    ).toThrow();
  });

  it('requires the same server secret to recover stored links', () => {
    expect(() =>
      createService('different-secret').restore(createService().create()),
    ).toThrow();
  });
});
