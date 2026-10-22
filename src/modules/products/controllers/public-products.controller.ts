import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { PublicProductCatalogDto } from '../dto/public-product-catalog.dto.js';
import { ProductsService } from '../services/products.service.js';

@ApiTags('Public products')
@Controller('public/locations/:locationId')
export class PublicProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('product-catalog')
  @ApiOperation({
    summary: 'Get the public product catalog for a location',
    description:
      'Active products offered by this location. Includes images, descriptions and non-empty categories. Stock is not reserved or checked.',
  })
  @ApiOkResponse({ type: ApiResponse(PublicProductCatalogDto) })
  @ApiNotFoundResponse({
    description: 'Location or brand is deleted, or location does not exist',
  })
  async catalog(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PublicProductCatalogDto>> {
    const products = await this.products.listForPublicCatalog(locationId);
    return BaseResponseDto.success(
      PublicProductCatalogDto.fromEntities(products),
    );
  }
}
