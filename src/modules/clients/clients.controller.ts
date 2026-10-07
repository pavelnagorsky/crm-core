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
import { BusinessRole } from '@prisma/client';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { SetClientBanDto } from './dto/set-client-ban.dto.js';
import { ClientResponseDto } from './dto/client-response.dto.js';
import { ClientSearchRequestDto } from './dto/client-search-request.dto.js';
import { ClientSearchResponseDto } from './dto/client-search-response.dto.js';
import { ClientImportResponseDto } from './clients-import/dto/client-import-response.dto.js';
import { ClientsImportService } from './clients-import/clients-import.service.js';
import { ClientImportFile } from './clients-import/decorators/client-import-upload.decorator.js';
import { ClientExportRequestDto } from './clients-export/dto/client-export-request.dto.js';
import { ClientsExportService } from './clients-export/clients-export.service.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../shared/dto/id-response.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { assertBrandRole } from '../auth/guards/assert-brand-role.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

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
  @Auth()
  @Post()
  async create(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertBrandRole(tokenPayload, brandId, BusinessRole.OWNER);
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
  @Auth()
  @ClientImportFile()
  @Post('import')
  async import(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientImportResponseDto>> {
    assertBrandRole(tokenPayload, brandId, BusinessRole.OWNER);
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
  @Auth()
  @Put(':id')
  async update(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    assertBrandRole(tokenPayload, brandId, BusinessRole.OWNER);
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
  @Auth()
  @Patch(':id/ban')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setBan(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetClientBanDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    assertBrandRole(tokenPayload, brandId, BusinessRole.OWNER);
    await this.clientsService.setBan(
      brandId,
      id,
      dto,
      auditActorFromToken(tokenPayload, brandId),
    );
  }

  @ApiOperation({ summary: 'Export clients as XLSX' })
  @ApiProduces(XlsxService.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Auth()
  @Get('export')
  async export(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ClientExportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    assertBrandRole(
      tokenPayload,
      brandId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const { stream, filename } = await this.clientsExportService.stream(
      brandId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxService.mimeType });
  }

  @ApiOperation({ summary: 'Get client by ID' })
  @ApiOkResponse({ type: ApiResponse(ClientResponseDto) })
  @ApiNotFoundResponse({ description: 'Client not found' })
  @Auth()
  @Get(':id')
  async findById(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientResponseDto>> {
    assertBrandRole(
      tokenPayload,
      brandId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
    const client = await this.clientsService.findInBrand(brandId, id);
    return BaseResponseDto.success(ClientResponseDto.fromEntity(client));
  }

  @ApiOperation({ summary: 'Search clients' })
  @ApiOkResponse({ type: ApiResponse(ClientSearchResponseDto) })
  @Auth()
  @Get()
  async search(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: ClientSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ClientSearchResponseDto>> {
    assertBrandRole(
      tokenPayload,
      brandId,
      BusinessRole.OWNER,
      BusinessRole.MANAGER,
      BusinessRole.STAFF,
    );
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
