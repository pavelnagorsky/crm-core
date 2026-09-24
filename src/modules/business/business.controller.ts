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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { BusinessService } from './business.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';
import { BusinessResponseDto } from './dto/business-response.dto.js';
import { BusinessPublicResponseDto } from './dto/business-public-response.dto.js';
import { BusinessSearchItemDto } from './dto/business-search-item.dto.js';
import { BusinessSearchRequestDto } from './dto/business-search-request.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { RBAC } from './decorators/rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';

@ApiTags('Businesses')
@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @ApiOperation({ summary: 'Create a new business' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Auth()
  @Post()
  async create(
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: CreateBusinessDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const actorName = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || 'Пользователь';
    const business = await this.businessService.create(payload.sub, dto, {
      id: payload.sub,
      name: actorName,
      role: AuditActorRole.OWNER,
    });
    return BaseResponseDto.success({ id: business.id });
  }

  @ApiOperation({ summary: 'Update business settings' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Business not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':businessId')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: UpdateBusinessDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const business = await this.businessService.update(businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: business.id });
  }

  @ApiOperation({
    summary: 'List businesses (own businesses for members, all for admins)',
  })
  @ApiOkResponse({ type: ApiResponseArray(BusinessSearchItemDto) })
  @Auth()
  @Get()
  async search(
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: BusinessSearchRequestDto,
  ): Promise<BaseResponseDto<BusinessSearchItemDto[]>> {
    const items = await this.businessService.search(payload, dto);
    return BaseResponseDto.success(items.map(BusinessSearchItemDto.fromEntity));
  }

  @ApiOperation({ summary: 'Get full business details (members only)' })
  @ApiOkResponse({ type: ApiResponse(BusinessResponseDto) })
  @ApiNotFoundResponse({ description: 'Business not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get(':businessId')
  async findById(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BaseResponseDto<BusinessResponseDto>> {
    const business = await this.businessService.findById(businessId);
    return BaseResponseDto.success(BusinessResponseDto.fromEntity(business));
  }

  @ApiOperation({ summary: 'Get public business info (no auth required)' })
  @ApiOkResponse({ type: ApiResponse(BusinessPublicResponseDto) })
  @ApiNotFoundResponse({ description: 'Business not found' })
  @Get(':businessId/public')
  async findPublic(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BaseResponseDto<BusinessPublicResponseDto>> {
    const business = await this.businessService.findById(businessId);
    return BaseResponseDto.success(
      BusinessPublicResponseDto.fromEntity(business),
    );
  }

  @ApiOperation({ summary: 'Delete business' })
  @ApiNoContentResponse()
  @RBAC(BusinessRole.OWNER)
  @Delete(':businessId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<void> {
    await this.businessService.delete(businessId);
  }
}
