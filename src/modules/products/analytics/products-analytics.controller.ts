import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { LocationRBAC } from '../../auth/decorators/location-rbac.decorator.js';
import { ProductsAnalyticsRequestDto } from './dto/products-analytics-request.dto.js';
import { ProductsAnalyticsResponseDto } from './dto/products-analytics-response.dto.js';
import { ProductsAnalyticsService } from './products-analytics.service.js';

@ApiTags('Products')
@Controller('locations/:locationId')
export class ProductsAnalyticsController {
  constructor(private readonly analyticsService: ProductsAnalyticsService) {}

  @ApiOperation({ summary: 'Fetch analytics widgets for the products page' })
  @ApiOkResponse({ type: ApiResponse(ProductsAnalyticsResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('products/analytics')
  async analytics(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: ProductsAnalyticsRequestDto,
  ): Promise<BaseResponseDto<ProductsAnalyticsResponseDto>> {
    const widgets = await this.analyticsService.getWidgets(locationId, dto);
    return BaseResponseDto.success(new ProductsAnalyticsResponseDto(widgets));
  }
}
