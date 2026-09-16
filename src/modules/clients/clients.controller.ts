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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { ClientResponseDto } from './dto/client-response.dto.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';
import { ClientSearchResponseDto } from './dto/client-search-response.dto.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/interfaces/audit-actor-from-token.js';

@ApiTags('Clients')
@Controller('businesses/:businessId/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @ApiOperation({ summary: 'Create a client' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @RBAC(BusinessRole.OWNER)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const client = await this.clientsService.create(businessId, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: client.id });
  }

  @ApiOperation({ summary: 'Update a client' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @RBAC(BusinessRole.OWNER)
  @Put(':id')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const client = await this.clientsService.update(businessId, id, dto, auditActorFromToken(tokenPayload, businessId));
    return BaseResponseDto.success({ id: client.id });
  }

  @ApiOperation({ summary: 'Delete a client' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Client not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.clientsService.delete(businessId, id, auditActorFromToken(tokenPayload, businessId));
  }

  @ApiOperation({ summary: 'Get client by ID' })
  @ApiOkResponse({ type: ApiResponse(ClientResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @RBAC(BusinessRole.OWNER)
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ClientResponseDto>> {
    const client = await this.clientsService.findById(id);
    return BaseResponseDto.success(ClientResponseDto.fromEntity(client));
  }

  @ApiOperation({ summary: 'Search clients' })
  @ApiOkResponse({ type: ApiResponse(ClientSearchResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Get('search')
  async search(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: ClientSearchRequestDto,
  ): Promise<BaseResponseDto<ClientSearchResponseDto>> {
    const { items, totalItems } = await this.clientsService.search(businessId, dto);
    return BaseResponseDto.success(
      new ClientSearchResponseDto(items.map(ClientResponseDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }
}
