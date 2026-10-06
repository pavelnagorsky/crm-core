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
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { BrandRBAC } from '../auth/decorators/brand-rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { BrandService } from './brand.service.js';
import { BrandPublicResponseDto } from './dto/brand-public-response.dto.js';
import { BrandResponseDto } from './dto/brand-response.dto.js';
import { BrandSearchItemDto } from './dto/brand-search-item.dto.js';
import { BrandSearchRequestDto } from './dto/brand-search-request.dto.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';

@ApiTags('Brands')
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @ApiOperation({ summary: 'Create a new brand with its first location' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Auth()
  @Post()
  async create(
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: CreateBrandDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const actorName =
      [payload.firstName, payload.lastName].filter(Boolean).join(' ') || 'User';
    const brand = await this.brandService.create(payload.sub, dto, {
      id: payload.sub,
      name: actorName,
      role: AuditActorRole.OWNER,
    });
    return BaseResponseDto.success({ id: brand.id });
  }

  @ApiOperation({ summary: 'List brands' })
  @ApiOkResponse({ type: ApiResponseArray(BrandSearchItemDto) })
  @Auth()
  @Get()
  async search(
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: BrandSearchRequestDto,
  ): Promise<BaseResponseDto<BrandSearchItemDto[]>> {
    const items = await this.brandService.search(payload, dto);
    return BaseResponseDto.success(items.map(BrandSearchItemDto.fromEntity));
  }

  @ApiOperation({ summary: 'Get brand details' })
  @ApiOkResponse({ type: ApiResponse(BrandResponseDto) })
  @ApiNotFoundResponse({ description: 'Brand not found' })
  @BrandRBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get(':brandId')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<BrandResponseDto>> {
    return BaseResponseDto.success(
      BrandResponseDto.fromEntity(await this.brandService.findById(brandId)),
    );
  }

  @ApiOperation({ summary: 'Update brand' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @BrandRBAC(BusinessRole.OWNER)
  @Put(':brandId')
  async update(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: UpdateBrandDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const brand = await this.brandService.update(
      brandId,
      dto,
      auditActorFromToken(payload, brandId),
    );
    return BaseResponseDto.success({ id: brand.id });
  }

  @ApiOperation({ summary: 'Get public brand info' })
  @ApiOkResponse({ type: ApiResponse(BrandPublicResponseDto) })
  @Get(':brandId/public')
  async findPublic(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<BrandPublicResponseDto>> {
    return BaseResponseDto.success(
      BrandPublicResponseDto.fromEntity(
        await this.brandService.findById(brandId),
      ),
    );
  }

  @ApiOperation({ summary: 'Delete brand' })
  @ApiNoContentResponse()
  @BrandRBAC(BusinessRole.OWNER)
  @Delete(':brandId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<void> {
    await this.brandService.delete(brandId);
  }
}
