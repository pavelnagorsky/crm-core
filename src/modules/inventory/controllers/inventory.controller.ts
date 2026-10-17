import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
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
import { CreateInventoryDocumentDto } from '../dto/create-inventory-document.dto.js';
import { InventoryBalanceResponseDto } from '../dto/inventory-balance-response.dto.js';
import { InventoryCountsRequestDto } from '../dto/inventory-counts-request.dto.js';
import { InventoryCountsResponseDto } from '../dto/inventory-counts-response.dto.js';
import { InventoryDocumentResponseDto } from '../dto/inventory-document-response.dto.js';
import { InventoryDocumentSearchRequestDto } from '../dto/inventory-document-search-request.dto.js';
import { InventoryDocumentSearchResponseDto } from '../dto/inventory-document-search-response.dto.js';
import { InventoryDocumentStatusCountResponseDto } from '../dto/inventory-document-status-count-response.dto.js';
import { InventoryDocumentStatusCountsRequestDto } from '../dto/inventory-document-status-counts-request.dto.js';
import { InventoryExportRequestDto } from '../dto/inventory-export-request.dto.js';
import { InventoryMovementExportRequestDto } from '../dto/inventory-movement-export-request.dto.js';
import { InventoryMovementResponseDto } from '../dto/inventory-movement-response.dto.js';
import { InventoryMovementSearchRequestDto } from '../dto/inventory-movement-search-request.dto.js';
import { InventoryMovementSearchResponseDto } from '../dto/inventory-movement-search-response.dto.js';
import { InventorySearchRequestDto } from '../dto/inventory-search-request.dto.js';
import { InventorySearchResponseDto } from '../dto/inventory-search-response.dto.js';
import { UpdateInventoryDocumentStatusDto } from '../dto/update-inventory-document-status.dto.js';
import { UpdateInventoryDocumentDto } from '../dto/update-inventory-document.dto.js';
import { InventoryFacade } from '../inventory.facade.js';
import { InventoryTurnoverExportRequestDto } from '../report/dto/inventory-turnover-export-request.dto.js';
import { InventoryTurnoverLineDto } from '../report/dto/inventory-turnover-line.dto.js';
import { InventoryTurnoverRequestDto } from '../report/dto/inventory-turnover-request.dto.js';
import { InventoryTurnoverSearchResponseDto } from '../report/dto/inventory-turnover-search-response.dto.js';
import { InventoryReportService } from '../report/services/inventory-report.service.js';
import { InventoryExportService } from '../services/inventory-export.service.js';

@ApiTags('Inventory')
@Controller('locations/:locationId/inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryFacade,
    private readonly reports: InventoryReportService,
    private readonly exports: InventoryExportService,
  ) {}

  @ApiOperation({ summary: 'Search current inventory balances' })
  @ApiOkResponse({ type: ApiResponse(InventorySearchResponseDto) })
  @Permissions(Permission.INVENTORY_READ)
  @Get()
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventorySearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventorySearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.INVENTORY_EXPORT, locationId);
    const { items, totalItems } = await this.inventory.searchInventory(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new InventorySearchResponseDto(
        items.map(InventoryBalanceResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get inventory table counts' })
  @ApiOkResponse({ type: ApiResponse(InventoryCountsResponseDto) })
  @Permissions(Permission.INVENTORY_READ)
  @Get('counts')
  async getCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryCountsRequestDto,
  ): Promise<BaseResponseDto<InventoryCountsResponseDto>> {
    return BaseResponseDto.success(
      InventoryCountsResponseDto.fromEntity(
        await this.inventory.getInventoryCounts(locationId, dto),
      ),
    );
  }

  @ApiOperation({ summary: 'Export current inventory balances as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.INVENTORY_EXPORT)
  @Get('export')
  async exportBalances(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryExportRequestDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.exports.stream(locationId, dto);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Search inventory turnover statement lines' })
  @ApiOkResponse({ type: ApiResponse(InventoryTurnoverSearchResponseDto) })
  @Permissions(Permission.INVENTORY_READ)
  @Get('vedomost')
  async searchVedomost(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryTurnoverRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryTurnoverSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.INVENTORY_EXPORT, locationId);
    const { items, totalItems, totals } = await this.reports.searchTurnover(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new InventoryTurnoverSearchResponseDto(
        items.map(InventoryTurnoverLineDto.fromEntity),
        InventoryTurnoverLineDto.fromEntity(totals),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({
    summary: 'Export inventory statement for manual count as XLSX',
  })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.INVENTORY_EXPORT)
  @Get('export/inventory-statement')
  async exportInventoryStatement(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } =
      await this.exports.streamInventoryStatement(locationId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Export inventory turnover statement as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.INVENTORY_EXPORT)
  @Get('export/vedomost')
  async exportVedomost(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryTurnoverExportRequestDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.reports.exportVedomost(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Search inventory movements for a product' })
  @ApiOkResponse({ type: ApiResponse(InventoryMovementSearchResponseDto) })
  @Permissions(Permission.INVENTORY_READ)
  @Get(':productId/movements')
  async searchMovements(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() dto: InventoryMovementSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryMovementSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.INVENTORY_EXPORT, locationId);
    const { items, totalItems } = await this.inventory.searchMovements(
      locationId,
      productId,
      dto,
    );
    return BaseResponseDto.success(
      new InventoryMovementSearchResponseDto(
        items.map(InventoryMovementResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Export inventory movements for a product as XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Permission.INVENTORY_EXPORT)
  @Get(':productId/movements/export')
  async exportMovements(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() dto: InventoryMovementExportRequestDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.exports.streamMovements(
      locationId,
      productId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({
    summary: 'Create an open inventory document',
    description:
      'Use quantity and unitCost for base units. Receipt lines may instead use packagingId, packageQuantity (whole packages), and packageUnitCost. A product may have multiple lines. Responses always expose quantity and unitCost in base units, plus the saved packaging input.',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @Permissions(Permission.INVENTORY_MANAGE)
  @Post('documents')
  async createDocument(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateInventoryDocumentDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    if (dto.destinationLocationId)
      assertPermission(
        token,
        Permission.INVENTORY_MANAGE,
        dto.destinationLocationId,
      );
    const document = await this.inventory.createDocument(
      locationId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: document.id });
  }

  @ApiOperation({ summary: 'Search inventory documents' })
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentSearchResponseDto) })
  @Permissions(Permission.INVENTORY_READ)
  @Get('documents')
  async searchDocuments(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryDocumentSearchRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryDocumentSearchResponseDto>> {
    if (dto.isExport)
      assertPermission(tokenPayload, Permission.INVENTORY_EXPORT, locationId);
    const { items, totalItems } = await this.inventory.searchDocuments(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      new InventoryDocumentSearchResponseDto(
        items.map(InventoryDocumentResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get inventory document count per status' })
  @ApiOkResponse({
    type: ApiResponseArray(InventoryDocumentStatusCountResponseDto),
  })
  @Permissions(Permission.INVENTORY_READ)
  @Get('documents/status-counts')
  async getDocumentStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryDocumentStatusCountsRequestDto,
  ): Promise<BaseResponseDto<InventoryDocumentStatusCountResponseDto[]>> {
    const counts = await this.inventory.getDocumentStatusCounts(
      locationId,
      dto,
    );
    return BaseResponseDto.success(
      counts.map((row) =>
        Object.assign(new InventoryDocumentStatusCountResponseDto(), row),
      ),
    );
  }

  @ApiOperation({ summary: 'Get an inventory document' })
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentResponseDto) })
  @ApiNotFoundResponse({ description: 'Inventory document not found' })
  @Permissions(Permission.INVENTORY_READ)
  @Get('documents/:documentId')
  async findDocument(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<BaseResponseDto<InventoryDocumentResponseDto>> {
    return BaseResponseDto.success(
      InventoryDocumentResponseDto.fromEntity(
        await this.inventory.findDocument(locationId, documentId),
      ),
    );
  }

  @ApiOperation({ summary: 'Replace an open inventory document' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Inventory document is immutable' })
  @Permissions(Permission.INVENTORY_MANAGE)
  @Put('documents/:documentId')
  async updateDocument(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateInventoryDocumentDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const current = await this.inventory.findDocument(locationId, documentId);
    if (current.destinationLocationId)
      assertPermission(
        token,
        Permission.INVENTORY_MANAGE,
        current.destinationLocationId,
      );
    if (dto.destinationLocationId)
      assertPermission(
        token,
        Permission.INVENTORY_MANAGE,
        dto.destinationLocationId,
      );
    const document = await this.inventory.updateDocument(
      current,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: document.id });
  }

  @ApiOperation({ summary: 'Post or void an inventory document' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Inventory status transition rejected' })
  @Permissions(Permission.INVENTORY_MANAGE)
  @Patch('documents/:documentId/status')
  async changeDocumentStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateInventoryDocumentStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const current = await this.inventory.findDocument(locationId, documentId);
    if (current.destinationLocationId)
      assertPermission(
        token,
        Permission.INVENTORY_MANAGE,
        current.destinationLocationId,
      );
    const document = await this.inventory.changeDocumentStatus(
      current,
      dto.status,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: document.id });
  }
}
