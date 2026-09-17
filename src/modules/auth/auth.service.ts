import { HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import { User } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { UserService } from '../user/user.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ConfirmEmailNotification } from '../notifications/notifications/confirm-email.notification.js';
import { ResetPasswordNotification } from '../notifications/notifications/reset-password.notification.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto.js';
import { OAuthResponseDto } from './dto/oauth-response.dto.js';
import { ITokens } from './interfaces/tokens.interface.js';
import { LoginException } from './exceptions/login.exception.js';
import { LoginErrorEnum } from './enums/login-error.enum.js';
import { IFrontendConfig, IJwtConfig } from '../../config/configuration.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';

const SALT_ROUNDS = 10;
const MAX_TOKENS_PER_USER = 10;
const REFRESH_TOKEN_TTL_DAYS = 90;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) throw new AppException(ErrorCode.EMAIL_ALREADY_IN_USE, HttpStatus.CONFLICT);

    const passwordHash = await hash(dto.password, SALT_ROUNDS);
    const user = await this.userService.create({ email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName });

    const token = await this.generateEmailToken(user);
    const cfg = this.config.get<IFrontendConfig>('frontend')!;
    await this.notifications.send(new ConfirmEmailNotification(user.email!, `${cfg.domain}/auth/confirm-email?token=${token}`));
    this.logger.log(`register: user=${user.id} email=${user.email}`);
  }

  async login(dto: LoginDto, userAgent: string | null): Promise<ITokens> {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) {
      this.logger.warn(`login failed: email=${dto.email} reason=USER_NOT_FOUND`);
      throw new LoginException(LoginErrorEnum.INVALID_DATA);
    }
    if (!user.passwordHash) {
      this.logger.warn(`login failed: userId=${user.id} reason=PASSWORD_NOT_SET`);
      throw new LoginException(LoginErrorEnum.PASSWORD_NOT_SET);
    }
    if (!user.emailVerifiedAt) {
      this.logger.warn(`login failed: userId=${user.id} reason=EMAIL_NOT_CONFIRMED`);
      throw new LoginException(LoginErrorEnum.EMAIL_NOT_CONFIRMED);
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      this.logger.warn(`login failed: userId=${user.id} reason=INVALID_PASSWORD`);
      throw new LoginException(LoginErrorEnum.INVALID_DATA);
    }

    this.logger.log(`login success: userId=${user.id}`);
    return this.issueTokens(user, userAgent);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.db.refreshToken.deleteMany({ where: { token: refreshToken, userId } });
    this.logger.log(`logout: userId=${userId}`);
  }

  async refresh(userId: string, refreshToken: string, userAgent: string | null): Promise<ITokens> {
    const stored = await this.db.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.userId !== userId || stored.expiryDate < new Date()) {
      throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    }

    await this.db.refreshToken.delete({ where: { token: refreshToken } });
    const user = await this.userService.findById(userId);
    return this.issueTokens(user, userAgent);
  }

  async confirmEmail(userId: string): Promise<void> {
    await this.userService.update(userId, { emailVerifiedAt: new Date() });
  }

  async resetPasswordRequest(dto: ResetPasswordRequestDto): Promise<void> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) return;

    const token = await this.generateResetPasswordToken(user);
    const cfg = this.config.get<IFrontendConfig>('frontend')!;
    await this.notifications.send(new ResetPasswordNotification(user.email!, `${cfg.domain}/auth/reset-password?token=${token}`));
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await hash(dto.password, SALT_ROUNDS);
    await this.userService.update(userId, { passwordHash });
    await this.db.refreshToken.deleteMany({ where: { userId } });
  }

  async handleOAuth(dto: OAuthResponseDto, userAgent: string | null): Promise<ITokens> {
    let user = await this.userService.findByEmail(dto.email);
    if (!user) {
      user = await this.userService.create({ email: dto.email, emailVerifiedAt: new Date() });
      this.logger.log(`oauth register: userId=${user.id} email=${user.email} provider=${dto.providerType}`);
    } else {
      this.logger.log(`oauth login: userId=${user.id} provider=${dto.providerType}`);
    }
    return this.issueTokens(user, userAgent);
  }

  private async issueTokens(user: User, userAgent: string | null): Promise<ITokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user),
    ]);
    await this.saveRefreshToken(user.id, refreshToken, userAgent);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string, userAgent: string | null): Promise<void> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.db.refreshToken.create({ data: { userId, token, userAgent, expiryDate } });

    // keep only the newest MAX_TOKENS_PER_USER, drop expired ones
    const all = await this.db.refreshToken.findMany({
      where: { userId },
      orderBy: { expiryDate: 'desc' },
      select: { id: true },
    });
    const toDelete = all.slice(MAX_TOKENS_PER_USER).map((t) => t.id);
    await this.db.refreshToken.deleteMany({
      where: { OR: [{ id: { in: toDelete } }, { userId, expiryDate: { lt: new Date() } }] },
    });
  }

  private sign(payload: Record<string, unknown>, secret: string, expiresIn: string): Promise<string> {
    return this.jwtService.signAsync(payload, { secret, expiresIn: expiresIn as any });
  }

  private async generateAccessToken(user: User): Promise<string> {
    const cfg = this.config.get<IJwtConfig>('jwt')!;
    const memberships = await this.db.membership.findMany({
      where: { userId: user.id },
      select: { businessId: true, role: true },
    });
    // firstName/lastName are embedded for audit display; can be stale until the user re-logs in — accepted trade-off.
    return this.sign({ sub: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName, memberships }, cfg.accessTokenSecret, cfg.accessTokenExpiration);
  }

  private generateRefreshToken(user: User): Promise<string> {
    const cfg = this.config.get<IJwtConfig>('jwt')!;
    return this.sign({ sub: user.id }, cfg.refreshTokenSecret, cfg.refreshTokenExpiration);
  }

  private generateEmailToken(user: User): Promise<string> {
    const cfg = this.config.get<IJwtConfig>('jwt')!;
    return this.sign({ sub: user.id }, cfg.emailTokenSecret, cfg.emailTokenExpiration);
  }

  private generateResetPasswordToken(user: User): Promise<string> {
    const cfg = this.config.get<IJwtConfig>('jwt')!;
    return this.sign({ sub: user.id }, cfg.resetPasswordTokenSecret, cfg.resetPasswordTokenExpiration);
  }
}
