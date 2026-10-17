import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { assertPermission } from '../../access/utils/assert-permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { ClientExportRequestDto } from '../export/dto/client-export-request.dto.js';
import { ClientsExportService } from '../export/services/clients-export.service.js';
import { ClientResponseDto } from '../dto/client-response.dto.js';
import { ClientSearchRequestDto } from '../dto/client-search-request.dto.js';
import { ClientSearchResponseDto } from '../dto/client-search-response.dto.js';
import { CreateClientDto } from '../dto/create-client.dto.js';
import { SetClientBanDto } from '../dto/set-client-ban.dto.js';
import { UpdateClientDto } from '../dto/update-client.dto.js';
import { ClientImportFile } from '../import/decorators/client-import-upload.decorator.js';
import { ClientImportResponseDto } from '../import/dto/client-import-response.dto.js';
import { ClientsImportService } from '../import/services/clients-import.service.js';
import { ClientsService } from '../services/clients.service.js';

@ApiTags('Clients')
@Controller('brands/:brandId/clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientsImportService: ClientsImportService,
    private readonly clientsExportService: ClientsExportService,
  ) {}

  @ApiOperation({ summary: 'Create a client' })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @Permissions(Permission.CLIENT_CREATE)
  @Post()
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const client = await this.clientsService.create(
      brandId,
      dto,
      auditActorFromToken(tokenPayload, brandId),
    );
    return BaseResponseDto.success({ id: client.id });
  }

  @ApiOperation({ summary: 'Import clients from an xlsx file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: ApiResponse(ClientImportResponseDto) })
  @ApiBadRequestResponse({
    description:
      'Import file is missing, corrupt, empty, over the row limit, or has no required columns',
  })
  @ApiPayloadTooLargeResponse({
    description: 'Import file exceeds the size limit',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Import file is not an .xlsx spreadsheet',
  })
  @Permissions(Permission.CLIENT_IMPORT)
  @ClientImportFile()
  @Post('import')
  async import(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientImportResponseDto>> {
    const result = await this.clientsImportService.import(
      brandId,
      file,
      auditActorFromToken(tokenPayload, brandId),
    );
    return BaseResponseDto.success(
      new ClientImportResponseDto(
        result.successCount,
        result.duplicateCount,
        result.errorCount,
      ),
    );
  }

  @ApiOperation({ summary: 'Update a client' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Phone number already in use' })
  @Permissions(Permission.CLIENT_UPDATE)
  @Put(':id')
  async update(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const updated = await this.clientsService.update(
      brandId,
      id,
      dto,
      auditActorFromToken(tokenPayload, brandId),
    );
    return BaseResponseDto.success({ id: updated.id });
  }

  @ApiOperation({ summary: 'Ban or unban a client from online booking' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({ description: 'Client ban is already in this state' })
  @Permissions(Permission.CLIENT_BAN)
  @Patch(':id/ban')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setBan(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetClientBanDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    await this.clientsService.setBan(
      brandId,
      id,
      dto,
      auditActorFromToken(tokenPayload, brandId),
    );
  }

  @ApiOperation({ summary: 'Export clients as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.CLIENT_EXPORT)
  @Get('export')
  async export(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ClientExportRequestDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.clientsExportService.stream(
      brandId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Get client by ID' })
  @ApiOkResponse({ type: ApiResponse(ClientResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @Permissions(Permission.CLIENT_READ)
  @Get(':id')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<ClientResponseDto>> {
    const client = await this.clientsService.findInBrand(brandId, id);
    return BaseResponseDto.success(ClientResponseDto.fromEntity(client));
  }

  @ApiOperation({ summary: 'Search clients' })
  @ApiOkResponse({ type: ApiResponse(ClientSearchResponseDto) })
  @Permissions(Permission.CLIENT_READ)
  @Get()
  async search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ClientSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.CLIENT_EXPORT, brandId);
    const { items, totalItems } = await this.clientsService.search(
      brandId,
      dto,
    );
    return BaseResponseDto.success(
      new ClientSearchResponseDto(
        items.map(ClientResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }
}
