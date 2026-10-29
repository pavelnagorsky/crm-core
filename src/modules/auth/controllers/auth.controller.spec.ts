import { UnauthorizedException } from '@nestjs/common';
import { cookieConfig } from '../../../config/cookie.config.js';
import { CookiesEnum } from '../enums/cookies.enum.js';
import { tokenPayload } from '../testing/factories/token-payload.factory.js';
import { AuthController } from './auth.controller.js';

describe('AuthController email confirmation', () => {
  function setup() {
    const auth = {
      confirmEmail: vi.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const res = { cookie: vi.fn() };
    const controller = new AuthController(auth as never);
    return { controller, auth, res };
  }

  it('returns the access token and sets an HttpOnly refresh cookie', async () => {
    const { controller, auth, res } = setup();

    const result = await controller.confirmEmail(
      tokenPayload(),
      res as never,
      'browser',
    );

    expect(auth.confirmEmail).toHaveBeenCalledWith('user-1', 'browser');
    expect(result).toMatchObject({
      isSuccess: true,
      responseValue: { accessToken: 'access-token' },
    });
    expect(result.responseValue).not.toHaveProperty('refreshToken');
    expect(res.cookie).toHaveBeenCalledExactlyOnceWith(
      CookiesEnum.REFRESH_TOKEN,
      'refresh-token',
      expect.objectContaining({
        ...cookieConfig,
        httpOnly: true,
        secure: true,
      }),
    );
  });

  it('does not set a session cookie when confirmation fails', async () => {
    const { controller, auth, res } = setup();
    auth.confirmEmail.mockRejectedValue(new UnauthorizedException());

    await expect(
      controller.confirmEmail(tokenPayload(), res as never, null),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(res.cookie).not.toHaveBeenCalled();
  });
});
