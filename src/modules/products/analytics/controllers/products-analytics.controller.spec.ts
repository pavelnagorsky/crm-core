import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { PermissionGuard } from '../../../auth/guards/permission.guard.js';
import {
  authorizeTestToken,
  tokenPayload,
} from '../../../auth/testing/factories/token-payload.factory.js';
import { ProductsAnalyticsRequestDto } from '../dto/products-analytics-request.dto.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';
import { ProductsAnalyticsController } from './products-analytics.controller.js';

describe('ProductsAnalyticsController', () => {
  const guard = new PermissionGuard(new Reflector());
  const context = (user: TokenPayloadDto, brandId = 'brand-1') =>
    ({
      getHandler: () => ProductsAnalyticsController.prototype.analytics,
      getClass: () => ProductsAnalyticsController,
      switchToHttp: () => ({
        getRequest: () => ({ user, params: { brandId } }),
      }),
    }) as unknown as ExecutionContext;

  it('exposes only the brand route', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ProductsAnalyticsController),
    ).toBe('brands/:brandId/products');
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ProductsAnalyticsController.prototype.analytics,
      ),
    ).toBe('analytics');
  });

  it('requires analytics access to the requested brand', () => {
    const brandManager = authorizeTestToken({
      ...tokenPayload('MANAGER'),
      brandMemberships: [{ brandId: 'brand-1', role: 'MANAGER' }],
    });
    expect(guard.canActivate(context(brandManager))).toBe(true);
    expect(() => guard.canActivate(context(tokenPayload('STAFF')))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate(context(brandManager, 'other-brand')),
    ).toThrow(ForbiddenException);
    const localOnly = tokenPayload('MANAGER');
    expect(() => guard.canActivate(context(localOnly))).toThrow(
      ForbiddenException,
    );
  });

  it('wraps the widgets and resolved locations in the standard response', async () => {
    const resolvedContext = { range: { locationIds: ['location-2'] } };
    const analytics = {
      getAnalytics: vi.fn().mockResolvedValue(resolvedContext),
    };
    const widgetFactory = { build: vi.fn().mockReturnValue([]) };
    const controller = new ProductsAnalyticsController(
      analytics as never,
      widgetFactory as never,
    );
    const dto = {
      keys: [ProductsAnalyticsWidgetKey.GROSS_PROFIT],
      locationIds: ['location-2'],
    } as ProductsAnalyticsRequestDto;
    const response = await controller.analytics('brand-1', dto);
    expect(analytics.getAnalytics).toHaveBeenCalledWith('brand-1', dto);
    expect(widgetFactory.build).toHaveBeenCalledWith(dto.keys, resolvedContext);
    expect(response).toMatchObject({
      isSuccess: true,
      responseValue: { widgets: [], locationIds: ['location-2'] },
    });
  });
});
