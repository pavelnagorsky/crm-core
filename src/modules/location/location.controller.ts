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
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessType } from '@prisma/client';
import { COUNTRY_DEFAULTS } from '../../shared/geo/country-defaults.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LocationBusinessTypesResponseDto } from './dto/location-business-types-response.dto.js';
import { LocationCountryOptionDto } from './dto/location-country-option.dto.js';
import { LocationOptionsResponseDto } from './dto/location-options-response.dto.js';
import { LocationResponseDto } from './dto/location-response.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationService } from './location.service.js';
import { Permission } from '../access/enums/permission.enum.js';
import { hasPermission } from '../access/utils/assert-permission.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';

@ApiTags('Locations')
@Controller()
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @ApiOperation({
    summary: 'List supported location countries and locale options',
  })
  @ApiOkResponse({ type: ApiResponse(LocationOptionsResponseDto) })
  @Auth()
  @Get('locations/options')
  async options(): Promise<BaseResponseDto<LocationOptionsResponseDto>> {
    return BaseResponseDto.success({
      countries: Object.entries(COUNTRY_DEFAULTS).map(
        ([countryCode, defaults]) =>
          new LocationCountryOptionDto(countryCode, defaults),
      ),
    });
  }

  @ApiOperation({
    summary: 'List business types for creating or updating a location',
  })
  @ApiOkResponse({ type: ApiResponse(LocationBusinessTypesResponseDto) })
  @Auth()
  @Get('locations/business-types')
  async businessTypes(): Promise<
    BaseResponseDto<LocationBusinessTypesResponseDto>
  > {
    return BaseResponseDto.success({
      businessTypes: Object.values(BusinessType),
    });
  }

  @ApiOperation({ summary: 'Create a location in a brand' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.LOCATION_CREATE)
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
  @Auth()
  @Get('brands/:brandId/locations')
  async listByBrand(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<LocationResponseDto[]>> {
    const locations = await this.locationService.listByBrand(brandId);
    return BaseResponseDto.success(
      locations
        .filter((location) =>
          hasPermission(token, Permission.LOCATION_READ, location.id),
        )
        .map(LocationResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Get location details' })
  @ApiOkResponse({ type: ApiResponse(LocationResponseDto) })
  @Permissions(Permission.LOCATION_READ)
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
  @Permissions(Permission.LOCATION_SETTINGS_MANAGE)
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
  @ApiConflictResponse({
    description:
      'BUSINESS_HAS_OPEN_BOOKINGS: cancel or complete open current and upcoming bookings first; responseValue.openBookingsCount contains the count',
  })
  @ApiNoContentResponse()
  @Permissions(Permission.LOCATION_SETTINGS_MANAGE)
  @Delete('locations/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<void> {
    await this.locationService.delete(locationId);
  }
}
