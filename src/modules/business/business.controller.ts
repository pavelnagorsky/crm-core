import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessService } from './business.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';
import { BusinessResponseDto } from './dto/business-response.dto.js';
import { BusinessSearchRequestDto } from './dto/business-search-request.dto.js';
import { BusinessSearchResponseDto } from './dto/business-search-response.dto.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';

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
    const business = await this.businessService.create(payload.sub, dto);
    return BaseResponseDto.success({ id: business.id });
  }

  @ApiOperation({ summary: 'Update business' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @Auth()
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: UpdateBusinessDto,
  ): Promise<BaseResponseDto<{ id: string }>> {
    const business = await this.businessService.update(id, payload, dto);
    return BaseResponseDto.success({ id: business.id });
  }

  @ApiOperation({ summary: 'Search businesses' })
  @ApiOkResponse({ type: ApiResponse(BusinessSearchResponseDto) })
  @Auth()
  @Get('search')
  async search(
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: BusinessSearchRequestDto,
  ): Promise<BaseResponseDto<BusinessSearchResponseDto>> {
    const { items, totalItems } = await this.businessService.search(payload, dto);
    return BaseResponseDto.success(
      new BusinessSearchResponseDto(
        items.map(BusinessResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Delete business' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @Auth()
  @Delete(':id')
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<void> {
    await this.businessService.delete(id, payload);
  }

  @ApiOperation({ summary: 'Get business by ID' })
  @ApiOkResponse({ type: ApiResponse(BusinessResponseDto) })
  @ApiNotFoundResponse({ description: 'Business not found' })
  @Auth()
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<BusinessResponseDto>> {
    const business = await this.businessService.findById(id);
    return BaseResponseDto.success(BusinessResponseDto.fromEntity(business));
  }
}
