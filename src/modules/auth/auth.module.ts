import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthCleanupService } from './auth-cleanup.service.js';
import { AuthController } from './auth.controller.js';
import { UserController } from '../user/user.controller.js';
import { AuthService } from './auth.service.js';
import { UserModule } from '../user/user.module.js';
import { JwtAccessStrategy } from './strategy/jwt-access.strategy.js';
import { JwtRefreshStrategy } from './strategy/jwt-refresh.strategy.js';
import { JwtEmailStrategy } from './strategy/jwt-email.strategy.js';
import { GoogleOAuthStrategy } from './strategy/google.strategy.js';
import { VkOAuthStrategy } from './strategy/vk.strategy.js';
import { YandexOAuthStrategy } from './strategy/yandex.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UserFromTokenPipe } from './pipes/user-from-token.pipe.js';

@Global()
@Module({
  imports: [
    UserModule,
    PassportModule.register({}),
    JwtModule.register({ global: true }),
    HttpModule,
  ],
  controllers: [AuthController, UserController],
  providers: [
    AuthService,
    AuthCleanupService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtEmailStrategy,
    GoogleOAuthStrategy,
    VkOAuthStrategy,
    YandexOAuthStrategy,
    UserFromTokenPipe,
  ],
  exports: [
    PassportModule,
    AuthService,
    UserFromTokenPipe,
    // JwtRefreshStrategy,
    // JwtAccessStrategy,
    // JwtEmailStrategy,
    // JwtResetPasswordStrategy,
    // GoogleOAuthStrategy,
    // VkOAuthStrategy,
    // YandexOAuthStrategy,
  ],
})
export class AuthModule {}
