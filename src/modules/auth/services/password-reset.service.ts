import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { compare, hash } from 'bcrypt';
import { randomInt } from 'crypto';
import {
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_RESEND_COOLDOWN_SECONDS,
  RESET_CODE_TTL_MINUTES,
} from '../../../config/token-expiration.config.js';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ResetPasswordNotification } from '../../notifications/messages/reset-password.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { UserService } from '../../user/services/user.service.js';
import { PASSWORD_HASH_ROUNDS } from '../constants/auth.constants.js';
import { ResetPasswordRequestDto } from '../dto/reset-password-request.dto.js';
import { ResetPasswordDto } from '../dto/reset-password.dto.js';
import { TokenEpochRegistryService } from './token-epoch-registry.service.js';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UserService,
    private readonly events: EventEmitter2,
    private readonly epochs: TokenEpochRegistryService,
  ) {}

  async request(dto: ResetPasswordRequestDto): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) return;
    const cutoff = new Date(
      Date.now() - RESET_CODE_RESEND_COOLDOWN_SECONDS * 1000,
    );
    const existing = await this.db.passwordResetCode.findUnique({
      where: { userId: user.id },
    });
    if (existing && existing.createdAt > cutoff) this.resendTooSoon();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await hash(code, PASSWORD_HASH_ROUNDS);
    const data = {
      codeHash,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000),
      failedAttempts: 0,
      createdAt: new Date(),
    };
    if (existing) {
      const { count } = await this.db.passwordResetCode.updateMany({
        where: { userId: user.id, createdAt: { lte: cutoff } },
        data,
      });
      if (count !== 1) this.resendTooSoon();
    } else {
      try {
        await this.db.passwordResetCode.create({
          data: { userId: user.id, ...data },
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
        )
          this.resendTooSoon();
        throw error;
      }
    }
    this.events.emit(
      NOTIFICATION_EVENT,
      new ResetPasswordNotification(user.email!, code),
    );
  }

  async reset(dto: ResetPasswordDto): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) this.invalidCode();
    const record = await this.db.passwordResetCode.findUnique({
      where: { userId: user.id },
    });
    if (
      !record ||
      record.expiresAt <= new Date() ||
      record.failedAttempts >= RESET_CODE_MAX_ATTEMPTS
    )
      this.invalidCode();
    if (!(await compare(dto.code, record.codeHash))) {
      await this.db.passwordResetCode.updateMany({
        where: {
          id: record.id,
          codeHash: record.codeHash,
          failedAttempts: { lt: RESET_CODE_MAX_ATTEMPTS },
        },
        data: { failedAttempts: { increment: 1 } },
      });
      this.invalidCode();
    }
    const passwordHash = await hash(dto.password, PASSWORD_HASH_ROUNDS);
    await this.db.$transaction(async (tx) => {
      // Consume this exact code generation once; a simultaneous reset or reissue must invalidate this attempt.
      const { count } = await tx.passwordResetCode.deleteMany({
        where: {
          id: record.id,
          codeHash: record.codeHash,
          expiresAt: { gt: new Date() },
          failedAttempts: { lt: RESET_CODE_MAX_ATTEMPTS },
        },
      });
      if (count !== 1) this.invalidCode();
      await this.users.update(user.id, { passwordHash }, tx);
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await this.epochs.bump(user.id, tx);
    });
  }

  private invalidCode(): never {
    throw new AppException(
      ErrorCode.INVALID_RESET_CODE,
      HttpStatus.BAD_REQUEST,
    );
  }

  private resendTooSoon(): never {
    throw new AppException(
      ErrorCode.RESET_CODE_RESEND_TOO_SOON,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
