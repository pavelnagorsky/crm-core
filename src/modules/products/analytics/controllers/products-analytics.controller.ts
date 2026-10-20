import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read } from '../../../access/utils/permission.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { ProductsAnalyticsRequestDto } from '../dto/products-analytics-request.dto.js';
import { ProductsAnalyticsResponseDto } from '../dto/products-analytics-response.dto.js';
import { ProductsAnalyticsService } from '../services/products-analytics.service.js';
import { ProductsAnalyticsWidgetFactory } from '../factories/products-analytics-widget.factory.js';

@ApiTags('Products')
@Controller('brands/:brandId/products')
export class ProductsAnalyticsController {
  constructor(
    private readonly analyticsService: ProductsAnalyticsService,
    private readonly widgetFactory: ProductsAnalyticsWidgetFactory,
  ) {}

  @ApiOperation({
    summary: 'Fetch product analytics for a brand or selected locations',
    description:
      'Omit locationIds to include all active brand locations. Repeat buyers are unique across the selected locations. Product revenue share divides filtered product revenue by all product and completed service revenue in the same location, period and staff scope.',
  })
  @ApiOkResponse({ type: ApiResponse(ProductsAnalyticsResponseDto) })
  @Permissions(Read(Claim.ANALYTICS_BRAND))
  @Post('analytics')
  async analytics(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ProductsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ProductsAnalyticsResponseDto>> {
    const context = await this.analyticsService.getAnalytics(brandId, dto);
    return BaseResponseDto.success(
      new ProductsAnalyticsResponseDto(
        this.widgetFactory.build(dto.keys, context),
        context.range.locationIds,
      ),
    );
  }
}
