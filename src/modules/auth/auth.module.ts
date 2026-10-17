import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccessModule } from '../access/access.module.js';
import { UserController } from '../user/controllers/user.controller.js';
import { UserModule } from '../user/user.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { TokenEpochGuard } from './guards/token-epoch.guard.js';
import { UserFromTokenPipe } from './pipes/user-from-token.pipe.js';
import { AuthCleanupService } from './services/auth-cleanup.service.js';
import { AuthService } from './services/auth.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { TokenEpochRegistryService } from './services/token-epoch-registry.service.js';
import { GoogleOAuthStrategy } from './strategies/google.strategy.js';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy.js';
import { JwtEmailStrategy } from './strategies/jwt-email.strategy.js';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js';
import { VkOAuthStrategy } from './strategies/vk.strategy.js';
import { YandexOAuthStrategy } from './strategies/yandex.strategy.js';

@Global()
@Module({
  imports: [
    AccessModule,
    UserModule,
    PassportModule.register({}),
    JwtModule.register({ global: true }),
    HttpModule,
  ],
  controllers: [AuthController, UserController],
  providers: [
    PasswordResetService,
    PermissionGuard,
    AuthService,
    AuthCleanupService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtEmailStrategy,
    GoogleOAuthStrategy,
    VkOAuthStrategy,
    YandexOAuthStrategy,
    UserFromTokenPipe,
    TokenEpochRegistryService,
    TokenEpochGuard,
  ],
  exports: [
    PermissionGuard,
    PassportModule,
    AuthService,
    UserFromTokenPipe,
    TokenEpochRegistryService,
    TokenEpochGuard,
  ],
})
export class AuthModule {}
