import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { BrandRBAC } from '../auth/decorators/brand-rbac.decorator.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LocationResponseDto } from './dto/location-response.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationService } from './location.service.js';

@ApiTags('Locations')
@Controller()
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @ApiOperation({ summary: 'Create a location in a brand' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @BrandRBAC(BusinessRole.OWNER)
  @Post('brands/:brandId/locations')
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateLocationDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const location = await this.locationService.create(brandId, dto);
    return BaseResponseDto.success({ id: location.id });
  }

  @ApiOperation({ summary: 'List brand locations' })
  @ApiOkResponse({ type: ApiResponseArray(LocationResponseDto) })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('brands/:brandId/locations')
  async listByBrand(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<LocationResponseDto[]>> {
    const locations = await this.locationService.listByBrand(brandId);
    return BaseResponseDto.success(
      locations.map(LocationResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Get location details' })
  @ApiOkResponse({ type: ApiResponse(LocationResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('locations/:locationId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<LocationResponseDto>> {
    return BaseResponseDto.success(
      LocationResponseDto.fromEntity(
        await this.locationService.findById(locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Update location' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('locations/:locationId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateLocationDto,
    @Body() rawBody: Record<string, unknown>,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const location = await this.locationService.update(
      locationId,
      dto,
      rawBody,
    );
    return BaseResponseDto.success({ id: location.id });
  }

  @ApiOperation({ summary: 'Get public location info' })
  @ApiOkResponse({ type: ApiResponse(LocationResponseDto) })
  @Get('locations/:locationId/public')
  async findPublic(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<LocationResponseDto>> {
    return BaseResponseDto.success(
      LocationResponseDto.fromEntity(
        await this.locationService.findById(locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Delete location' })
  @ApiNoContentResponse()
  @LocationRBAC(BusinessRole.OWNER)
  @Delete('locations/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<void> {
    await this.locationService.delete(locationId);
  }
}
