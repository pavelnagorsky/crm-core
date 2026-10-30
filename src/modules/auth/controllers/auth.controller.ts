import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { cookieConfig } from '../../../config/cookie.config.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { UnauthorizedResponseDto } from '../../../shared/dto/unauthorized-response.dto.js';
import { ValidationErrorResponseDto } from '../../../shared/dto/validation-error-response.dto.js';
import { OAuthData } from '../decorators/oauth-data.decorator.js';
import { TokenPayload } from '../decorators/token-payload.decorator.js';
import { UserAgent } from '../decorators/user-agent.decorator.js';
import { AuthDto } from '../dto/auth.dto.js';
import { GoogleOauthRequestDto } from '../dto/google-oauth-request.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { RegisterDto } from '../dto/register.dto.js';
import { ResetPasswordRequestDto } from '../dto/reset-password-request.dto.js';
import { ResetPasswordDto } from '../dto/reset-password.dto.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { VkOauthRequestDto } from '../dto/vk-oauth-request.dto.js';
import { YandexOauthRequestDto } from '../dto/yandex-oauth-request.dto.js';
import { CookiesEnum } from '../enums/cookies.enum.js';
import { GoogleOAuthGuard } from '../guards/google-oauth.guard.js';
import { JwtEmailGuard } from '../guards/jwt-email.guard.js';
import { JwtRefreshGuard } from '../guards/jwt-refresh.guard.js';
import { VkOAuthGuard } from '../guards/vk-oauth.guard.js';
import { YandexOAuthGuard } from '../guards/yandex-oauth.guard.js';
import { AuthService } from '../services/auth.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @ApiOkResponse({
    type: ValidationErrorResponseDto,
    description: 'Validation error',
  })
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<BaseResponseDto> {
    await this.authService.register(dto);
    return BaseResponseDto.success();
  }

  @ApiOperation({ summary: 'Login' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.login(dto, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }

  @ApiOperation({ summary: 'Logout' })
  @ApiOkResponse({ type: BaseResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  async logout(
    @Res({ passthrough: true }) res: Response,
    @TokenPayload() payload: TokenPayloadDto & { refreshToken: string },
  ): Promise<BaseResponseDto> {
    await this.authService.logout(payload.sub, payload.refreshToken);
    res.clearCookie(CookiesEnum.REFRESH_TOKEN, cookieConfig);
    return BaseResponseDto.success();
  }

  @ApiOperation({ summary: 'Refresh tokens' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @TokenPayload() payload: TokenPayloadDto & { refreshToken: string },
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.refresh(
      payload.sub,
      payload.refreshToken,
      userAgent,
    );
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }

  @ApiOperation({ summary: 'Confirm email and sign in' })
  @ApiQuery({ name: 'token', type: String })
  @ApiCreatedResponse({
    type: ApiResponse(AuthDto),
    description:
      'Email confirmed successfully. Returns an access token and sets the refresh token cookie. The confirmation link can only be used once.',
  })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtEmailGuard)
  @Post('confirm-email')
  async confirmEmail(
    @TokenPayload() payload: TokenPayloadDto,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.confirmEmail(payload.sub, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }

  @ApiOperation({ summary: 'Request password reset email' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('reset-password-request')
  async resetPasswordRequest(
    @Body() dto: ResetPasswordRequestDto,
  ): Promise<BaseResponseDto> {
    await this.authService.resetPasswordRequest(dto);
    return BaseResponseDto.success();
  }

  @ApiOperation({ summary: 'Reset password' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<BaseResponseDto> {
    await this.authService.resetPassword(dto);
    return BaseResponseDto.success();
  }

  @ApiOperation({
    summary: 'Google sign-in: authorization code or One Tap',
    description:
      'Use type=oauth with authCode, or type=one-tap with oneTapCode (Google ID token). Returns an access token and sets the refresh token cookie.',
  })
  @ApiBody({ type: GoogleOauthRequestDto })
  @ApiCreatedResponse({ type: ApiResponse(AuthDto) })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(GoogleOAuthGuard)
  @Post('google')
  async googleOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }

  @ApiOperation({ summary: 'OAuth — VK' })
  @ApiBody({ type: VkOauthRequestDto })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @UseGuards(VkOAuthGuard)
  @Post('vk')
  async vkOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }

  @ApiOperation({ summary: 'OAuth — Yandex' })
  @ApiBody({ type: YandexOauthRequestDto })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @UseGuards(YandexOAuthGuard)
  @Post('yandex')
  async yandexOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: Response,
    @UserAgent() userAgent: string | null,
  ): Promise<BaseResponseDto<AuthDto>> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, cookieConfig);
    return BaseResponseDto.success(new AuthDto(tokens.accessToken));
  }
}
