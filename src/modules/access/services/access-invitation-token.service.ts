import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessInvitation } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

@Injectable()
export class AccessInvitationTokenService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = createHmac(
      'sha256',
      config.getOrThrow<string>('jwt.emailTokenSecret'),
    )
      .update('access-invitation-token-encryption:v1')
      .digest();
  }

  create() {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hash(token);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(tokenHash));
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    const tokenEncrypted = Buffer.concat([
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]).toString('base64url');
    return { token, tokenHash, tokenEncrypted };
  }

  restore(
    invitation: Pick<AccessInvitation, 'tokenHash' | 'tokenEncrypted'>,
  ): string {
    const encrypted = Buffer.from(invitation.tokenEncrypted, 'base64url');
    const ciphertextOffset = IV_BYTES + AUTH_TAG_BYTES;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      encrypted.subarray(0, IV_BYTES),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(encrypted.subarray(IV_BYTES, ciphertextOffset));
    decipher.setAAD(Buffer.from(invitation.tokenHash));
    return Buffer.concat([
      decipher.update(encrypted.subarray(ciphertextOffset)),
      decipher.final(),
    ]).toString('utf8');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
