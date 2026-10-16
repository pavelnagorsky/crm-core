import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { ProductsAnalyticsRequestDto } from './dto/products-analytics-request.dto.js';
import { ProductsAnalyticsResponseDto } from './dto/products-analytics-response.dto.js';
import { ProductsAnalyticsService } from './products-analytics.service.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';

@ApiTags('Products')
@Controller('locations/:locationId')
export class ProductsAnalyticsController {
  constructor(private readonly analyticsService: ProductsAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the products page' })
  @ApiOkResponse({ type: ApiResponse(ProductsAnalyticsResponseDto) })
  @Permissions(Permission.ANALYTICS_LOCATION_READ)
  @Post('products/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ProductsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ProductsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new ProductsAnalyticsResponseDto(widgets));
  }
}
