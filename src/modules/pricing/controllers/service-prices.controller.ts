import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { ServicePricesResponseDto } from '../dto/service-prices-response.dto.js';
import { SetServiceLevelPricesDto } from '../dto/set-service-level-prices.dto.js';
import { SetServiceStaffPricesDto } from '../dto/set-service-staff-prices.dto.js';
import { SetStaffServicePricesDto } from '../dto/set-staff-service-prices.dto.js';
import { StaffServicePricesResponseDto } from '../dto/staff-service-prices-response.dto.js';
import { ServicePricesService } from '../services/service-prices.service.js';

@ApiTags('Pricing')
@Controller('locations/:locationId')
export class ServicePricesController {
  constructor(private readonly prices: ServicePricesService) {}

  @ApiOperation({
    summary: 'Prices of a service: base, by level and by staff member',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePricesResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @Permissions(Read(Claim.PRICING))
  @Get('services/:serviceId/prices')
  async getServicePrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
  ): Promise<BaseResponseDto<ServicePricesResponseDto>> {
    const view = await this.prices.getServicePrices(locationId, serviceId);
    return BaseResponseDto.success(ServicePricesResponseDto.fromView(view));
  }

  @ApiOperation({
    summary: 'Set the prices of non-default levels for a service',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePricesResponseDto) })
  @ApiNotFoundResponse({
    description: 'Service not found or PRICE_LEVEL_NOT_FOUND',
  })
  @ApiBadRequestResponse({ description: 'PRICE_LEVEL_DEFAULT_PRICE' })
  @Permissions(Write(Claim.PRICING))
  @Put('services/:serviceId/level-prices')
  async setLevelPrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: SetServiceLevelPricesDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePricesResponseDto>> {
    const view = await this.prices.setLevelPrices(
      locationId,
      serviceId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(ServicePricesResponseDto.fromView(view));
  }

  @ApiOperation({
    summary: 'Set the personal prices of staff members for a service',
  })
  @ApiOkResponse({ type: ApiResponse(ServicePricesResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiBadRequestResponse({ description: 'STAFF_SERVICE_NOT_ASSIGNED' })
  @Permissions(Write(Claim.PRICING))
  @Put('services/:serviceId/staff-prices')
  async setStaffPrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: SetServiceStaffPricesDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePricesResponseDto>> {
    const view = await this.prices.setStaffPrices(
      locationId,
      serviceId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(ServicePricesResponseDto.fromView(view));
  }

  @ApiOperation({ summary: 'Prices of a staff member for their services' })
  @ApiOkResponse({ type: ApiResponse(StaffServicePricesResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @Permissions(Read(Claim.PRICING))
  @Get('staff/:staffId/service-prices')
  async getStaffServicePrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ): Promise<BaseResponseDto<StaffServicePricesResponseDto>> {
    const view = await this.prices.getStaffServicePrices(locationId, staffId);
    return BaseResponseDto.success(
      StaffServicePricesResponseDto.fromView(view),
    );
  }

  @ApiOperation({ summary: 'Set the personal prices of a staff member' })
  @ApiOkResponse({ type: ApiResponse(StaffServicePricesResponseDto) })
  @ApiNotFoundResponse({ description: 'Staff member not found' })
  @ApiBadRequestResponse({ description: 'STAFF_SERVICE_NOT_ASSIGNED' })
  @Permissions(Write(Claim.PRICING))
  @Put('staff/:staffId/service-prices')
  async setStaffServicePrices(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() dto: SetStaffServicePricesDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<StaffServicePricesResponseDto>> {
    const view = await this.prices.setStaffServicePrices(
      locationId,
      staffId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      StaffServicePricesResponseDto.fromView(view),
    );
  }
}
