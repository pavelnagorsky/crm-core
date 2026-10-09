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
import { BusinessRole } from '@prisma/client';
import {
  ApiResponse,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { CreateInventoryDocumentDto } from './dto/create-inventory-document.dto.js';
import { InventoryBalanceResponseDto } from './dto/inventory-balance-response.dto.js';
import { InventoryDocumentResponseDto } from './dto/inventory-document-response.dto.js';
import { InventoryDocumentSearchRequestDto } from './dto/inventory-document-search-request.dto.js';
import { InventoryDocumentSearchResponseDto } from './dto/inventory-document-search-response.dto.js';
import { InventoryMovementResponseDto } from './dto/inventory-movement-response.dto.js';
import { InventoryMovementSearchRequestDto } from './dto/inventory-movement-search-request.dto.js';
import { InventoryMovementSearchResponseDto } from './dto/inventory-movement-search-response.dto.js';
import { InventorySearchRequestDto } from './dto/inventory-search-request.dto.js';
import { InventorySearchResponseDto } from './dto/inventory-search-response.dto.js';
import { UpdateInventoryDocumentStatusDto } from './dto/update-inventory-document-status.dto.js';
import { UpdateInventoryDocumentDto } from './dto/update-inventory-document.dto.js';
import { InventoryReportQueryDto } from './report/dto/inventory-report-query.dto.js';
import { InventoryReportService } from './report/inventory-report.service.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('Inventory')
@Controller('locations/:locationId/inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly reports: InventoryReportService,
  ) {}

  @ApiOperation({ summary: 'Search current inventory balances' })
  @ApiOkResponse({ type: ApiResponse(InventorySearchResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get()
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventorySearchRequestDto,
  ): Promise<BaseResponseDto<InventorySearchResponseDto>> {
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

  @ApiOperation({ summary: 'Export inventory turnover statement as XLSX' })
  @ApiProduces(XlsxService.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('export/vedomost')
  async exportVedomost(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryReportQueryDto,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    const { stream, filename } = await this.reports.exportVedomost(
      locationId,
      dto,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxService.mimeType });
  }

  @ApiOperation({ summary: 'Search inventory movements for a product' })
  @ApiOkResponse({ type: ApiResponse(InventoryMovementSearchResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get(':productId/movements')
  async searchMovements(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() dto: InventoryMovementSearchRequestDto,
  ): Promise<BaseResponseDto<InventoryMovementSearchResponseDto>> {
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

  @ApiOperation({ summary: 'Create an open inventory document' })
  @ApiCreatedResponse({ type: ApiResponse(InventoryDocumentResponseDto) })
  @LocationRBAC(BusinessRole.OWNER)
  @Post('documents')
  async createDocument(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateInventoryDocumentDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryDocumentResponseDto>> {
    const document = await this.inventory.createDocument(
      locationId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(
      InventoryDocumentResponseDto.fromEntity(document),
    );
  }

  @ApiOperation({ summary: 'Search inventory documents' })
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentSearchResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get('documents')
  async searchDocuments(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: InventoryDocumentSearchRequestDto,
  ): Promise<BaseResponseDto<InventoryDocumentSearchResponseDto>> {
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

  @ApiOperation({ summary: 'Get an inventory document' })
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentResponseDto) })
  @ApiNotFoundResponse({ description: 'Inventory document not found' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentResponseDto) })
  @ApiConflictResponse({ description: 'Inventory document is immutable' })
  @LocationRBAC(BusinessRole.OWNER)
  @Put('documents/:documentId')
  async updateDocument(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateInventoryDocumentDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryDocumentResponseDto>> {
    const document = await this.inventory.updateDocument(
      locationId,
      documentId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(
      InventoryDocumentResponseDto.fromEntity(document),
    );
  }

  @ApiOperation({ summary: 'Post or void an inventory document' })
  @ApiOkResponse({ type: ApiResponse(InventoryDocumentResponseDto) })
  @ApiConflictResponse({ description: 'Inventory status transition rejected' })
  @LocationRBAC(BusinessRole.OWNER)
  @Patch('documents/:documentId/status')
  async changeDocumentStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateInventoryDocumentStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<InventoryDocumentResponseDto>> {
    const document = await this.inventory.changeDocumentStatus(
      locationId,
      documentId,
      dto.status,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(
      InventoryDocumentResponseDto.fromEntity(document),
    );
  }
}
