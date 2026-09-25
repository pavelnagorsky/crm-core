import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { ClientResponseDto } from './dto/client-response.dto.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';
import { ClientSearchResponseDto } from './dto/client-search-response.dto.js';
import { ClientImportRequestDto } from './clients-import/dto/client-import-request.dto.js';
import { ClientImportResponseDto } from './clients-import/dto/client-import-response.dto.js';
import { ClientsImportService } from './clients-import/clients-import.service.js';
import { ClientImportFile } from './clients-import/decorators/client-import-upload.decorator.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { ApiResponse, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto, assertBusinessRole } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Clients')
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientsImportService: ClientsImportService,
  ) {}

  @ApiOperation({ summary: 'Create a client' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @Auth()
  @Post()
  async create(
    @Body() dto: CreateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const client = await this.clientsService.create(dto.businessId, dto, auditActorFromToken(tokenPayload, dto.businessId));
    return BaseResponseDto.success({ id: client.id });
  }

  @ApiOperation({ summary: 'Import clients from an xlsx file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'businessId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        businessId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOkResponse({ type: ApiResponse(ClientImportResponseDto) })
  @ApiBadRequestResponse({ description: 'Import file is missing, corrupt, empty, over the row limit, or has no required columns' })
  @ApiPayloadTooLargeResponse({ description: 'Import file exceeds the size limit' })
  @ApiUnprocessableEntityResponse({ description: 'Import file is not an .xlsx spreadsheet' })
  @Auth()
  @ClientImportFile()
  @Post('import')
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ClientImportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientImportResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER);
    const result = await this.clientsImportService.import(dto.businessId, file);
    return BaseResponseDto.success(
      new ClientImportResponseDto(result.successCount, result.duplicateCount, result.errorCount),
    );
  }

  @ApiOperation({ summary: 'Update a client' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @Auth()
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const client = await this.clientsService.findById(id);
    assertBusinessRole(tokenPayload, client.businessId, BusinessRole.OWNER);
    const updated = await this.clientsService.update(client.businessId, id, dto, auditActorFromToken(tokenPayload, client.businessId));
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Get client by ID' })
  @ApiOkResponse({ type: ApiResponse(ClientResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @Auth()
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientResponseDto>> {
    const client = await this.clientsService.findById(id);
    assertBusinessRole(tokenPayload, client.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    return BaseResponseDto.success(ClientResponseDto.fromEntity(client));
  }

  @ApiOperation({ summary: 'Search clients' })
  @ApiOkResponse({ type: ApiResponse(ClientSearchResponseDto) })
  @Auth()
  @Get()
  async search(
    @Query() dto: ClientSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientSearchResponseDto>> {
    assertBusinessRole(tokenPayload, dto.businessId, BusinessRole.OWNER, BusinessRole.STAFF);
    const { items, totalItems } = await this.clientsService.search(dto.businessId, dto);
    return BaseResponseDto.success(
      new ClientSearchResponseDto(items.map(ClientResponseDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }
}
