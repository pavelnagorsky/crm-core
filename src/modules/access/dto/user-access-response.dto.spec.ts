import { UserRole } from '@prisma/client';
import {
  authorizeTestToken,
  tokenPayload,
} from '../../auth/testing/factories/token-payload.factory.js';
import { UserAccessResponseDto } from './user-access-response.dto.js';

describe('User access response', () => {
  it('exposes the global grant even when an administrator has no memberships', () => {
    const token = authorizeTestToken({
      ...tokenPayload(),
      role: UserRole.ADMIN,
      brandMemberships: [],
      locationMemberships: [],
    });
    expect(UserAccessResponseDto.fromToken(token, [])).toEqual({
      permissions: { '*': ['*'] },
      scopes: [],
    });
  });

  it('exposes the same scoped claims as the token and keeps membership context', () => {
    const token = tokenPayload();
    const response = UserAccessResponseDto.fromToken(token, []);
    expect(response.permissions).toEqual(token.permissions);
    expect(response.permissions).not.toHaveProperty('*');
    expect(response).not.toHaveProperty('platformAdmin');
    expect(response.scopes).toContainEqual(
      expect.objectContaining({
        brandId: 'brand-1',
        locationId: 'location-1',
        permissions: token.permissions?.['L:location-1'],
      }),
    );
  });
});
