import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Write } from '../../../access/utils/permission.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../../shared/dto/id-response.dto.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { UpdateServiceStatusDto } from '../../dto/update-service-status.dto.js';
import { CreateServiceDto } from '../dto/create-service.dto.js';
import { UpdateServiceDto } from '../dto/update-service.dto.js';
import { ServiceWriteService } from '../services/service-write.service.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServiceWriteController {
  constructor(private readonly servicesService: ServiceWriteService) {}

  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.SERVICE))
  @Post('services')
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: service.id });
  }

  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service not found' })
  @Permissions(Write(Claim.SERVICE))
  @Put('services/:id')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const service = await this.servicesService.update(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: service.id });
  }

  @ApiOperation({ summary: 'Change service status' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiConflictResponse({ description: 'Service already has this status' })
  @Permissions(Write(Claim.SERVICE))
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('services/:id/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.changeStatus(
      locationId,
      id,
      dto.status,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Delete a service' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service not found' })
  @ApiConflictResponse({
    description: 'Service is used in bookings or compensation plans',
  })
  @Permissions(Write(Claim.SERVICE))
  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.servicesService.delete(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}
