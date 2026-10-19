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
import { CreateServiceBundleDto } from '../dto/create-service-bundle.dto.js';
import { UpdateServiceBundleDto } from '../dto/update-service-bundle.dto.js';
import { ServiceBundleWriteService } from '../services/service-bundle-write.service.js';

@ApiTags('Services')
@Controller('locations/:locationId')
export class ServiceBundleWriteController {
  constructor(private readonly serviceBundles: ServiceBundleWriteService) {}

  @ApiOperation({ summary: 'Create a service bundle' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Write(Claim.SERVICE))
  @Post('service-bundles')
  async createBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateServiceBundleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const bundle = await this.serviceBundles.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: bundle.id });
  }

  @ApiOperation({ summary: 'Update a service bundle' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @Permissions(Write(Claim.SERVICE))
  @Put('service-bundles/:id')
  async updateBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceBundleDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const bundle = await this.serviceBundles.update(
      locationId,
      id,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success({ id: bundle.id });
  }

  @ApiOperation({ summary: 'Change service bundle status' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @ApiConflictResponse({ description: 'Bundle already has this status' })
  @Permissions(Write(Claim.SERVICE))
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('service-bundles/:id/status')
  async updateBundleStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceStatusDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.serviceBundles.changeStatus(
      locationId,
      id,
      dto.status,
      auditActorFromToken(tokenPayload, locationId),
    );
  }

  @ApiOperation({ summary: 'Delete a service bundle' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Service bundle not found' })
  @ApiConflictResponse({ description: 'Bundle is used in bookings' })
  @Permissions(Write(Claim.SERVICE))
  @Delete('service-bundles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBundle(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.serviceBundles.delete(
      locationId,
      id,
      auditActorFromToken(tokenPayload, locationId),
    );
  }
}
