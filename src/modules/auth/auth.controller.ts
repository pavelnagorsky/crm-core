import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { AuthDto } from './dto/auth.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResetPasswordRequestDto } from './dto/reset-password-request.dto.js';
import { GoogleOauthRequestDto } from './dto/google-oauth-request.dto.js';
import { VkOauthRequestDto } from './dto/vk-oauth-request.dto.js';
import { YandexOauthRequestDto } from './dto/yandex-oauth-request.dto.js';
import { OAuthResponseDto } from './dto/oauth-response.dto.js';
import { TokenPayloadDto } from './dto/token-payload.dto.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';
import { JwtEmailGuard } from './guards/jwt-email.guard.js';
import { GoogleOAuthGuard } from './guards/google-oauth.guard.js';
import { VkOAuthGuard } from './guards/vk-oauth.guard.js';
import { YandexOAuthGuard } from './guards/yandex-oauth.guard.js';
import { TokenPayload } from './decorators/token-payload.decorator.js';
import { OAuthData } from './decorators/oauth-data.decorator.js';
import { UserAgent } from './decorators/user-agent.decorator.js';
import { CookiesEnum } from './enums/cookies.enum.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { UnauthorizedResponseDto, ValidationErrorResponseDto } from '../../shared/validation/validation-exception.dto.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 90 * 24 * 60 * 60 * 1000,
  sameSite: 'none' as const,
  secure: true,
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Register' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @ApiOkResponse({ type: ValidationErrorResponseDto, description: 'Validation error' })
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<void> {
    await this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Login' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: any,
    @UserAgent() userAgent: string | null,
  ): Promise<AuthDto> {
    const tokens = await this.authService.login(dto, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, COOKIE_OPTIONS);
    return new AuthDto(tokens.accessToken);
  }

  @ApiOperation({ summary: 'Logout' })
  @ApiOkResponse({ type: BaseResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  async logout(
    @Res({ passthrough: true }) res: any,
    @TokenPayload() payload: TokenPayloadDto & { refreshToken: string },
  ): Promise<void> {
    await this.authService.logout(payload.sub, payload.refreshToken);
    res.clearCookie(CookiesEnum.REFRESH_TOKEN, COOKIE_OPTIONS);
  }

  @ApiOperation({ summary: 'Refresh tokens' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refresh(
    @Res({ passthrough: true }) res: any,
    @TokenPayload() payload: TokenPayloadDto & { refreshToken: string },
    @UserAgent() userAgent: string | null,
  ): Promise<AuthDto> {
    const tokens = await this.authService.refresh(payload.sub, payload.refreshToken, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, COOKIE_OPTIONS);
    return new AuthDto(tokens.accessToken);
  }

  @ApiOperation({ summary: 'Confirm email' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @ApiUnauthorizedResponse({ type: UnauthorizedResponseDto })
  @UseGuards(JwtEmailGuard)
  @Post('confirm-email')
  async confirmEmail(@TokenPayload() payload: TokenPayloadDto): Promise<void> {
    await this.authService.confirmEmail(payload.sub);
  }

  @ApiOperation({ summary: 'Request password reset email' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('reset-password-request')
  async resetPasswordRequest(@Body() dto: ResetPasswordRequestDto): Promise<void> {
    await this.authService.resetPasswordRequest(dto);
  }

  @ApiOperation({ summary: 'Reset password' })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @ApiOperation({ summary: 'OAuth — Google' })
  @ApiBody({ type: GoogleOauthRequestDto })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @UseGuards(GoogleOAuthGuard)
  @Post('google')
  async googleOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: any,
    @UserAgent() userAgent: string | null,
  ): Promise<AuthDto> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, COOKIE_OPTIONS);
    return new AuthDto(tokens.accessToken);
  }

  @ApiOperation({ summary: 'OAuth — VK' })
  @ApiBody({ type: VkOauthRequestDto })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @UseGuards(VkOAuthGuard)
  @Post('vk')
  async vkOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: any,
    @UserAgent() userAgent: string | null,
  ): Promise<AuthDto> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, COOKIE_OPTIONS);
    return new AuthDto(tokens.accessToken);
  }

  @ApiOperation({ summary: 'OAuth — Yandex' })
  @ApiBody({ type: YandexOauthRequestDto })
  @ApiOkResponse({ type: ApiResponse(AuthDto) })
  @UseGuards(YandexOAuthGuard)
  @Post('yandex')
  async yandexOAuth(
    @OAuthData() oauthData: OAuthResponseDto,
    @Res({ passthrough: true }) res: any,
    @UserAgent() userAgent: string | null,
  ): Promise<AuthDto> {
    const tokens = await this.authService.handleOAuth(oauthData, userAgent);
    res.cookie(CookiesEnum.REFRESH_TOKEN, tokens.refreshToken, COOKIE_OPTIONS);
    return new AuthDto(tokens.accessToken);
  }
}
