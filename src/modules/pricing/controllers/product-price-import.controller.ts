import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiBodyOptions,
  ApiConflictResponse,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PRODUCT_PRICE_IMPORT_MAX_BYTES } from '../constants/product-price-import.constants.js';
import { ServicePriceImportFile } from '../decorators/service-price-import-upload.decorator.js';
import { ProductPriceImportPreviewDto } from '../dto/product-price-import-preview.dto.js';
import { ProductPriceImportResultDto } from '../dto/product-price-import-result.dto.js';
import { ServicePriceImportRequestDto } from '../dto/service-price-import-request.dto.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { ProductPriceExportService } from '../services/product-price-export.service.js';
import { ProductPriceImportService } from '../services/product-price-import.service.js';

const UPLOAD_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
      effectiveDate: {
        type: 'string',
        example: '2027-01-01',
        description: 'YYYY-MM-DD; empty means now',
      },
    },
  },
};

type HeaderSetter = { setHeader: (name: string, value: string) => void };

/** Product retail prices in Excel: the current prices, the template, the checked upload and the upload. */
@ApiTags('Pricing')
@Controller('locations/:locationId/product-prices')
export class ProductPriceImportController {
  constructor(
    private readonly exporter: ProductPriceExportService,
    private readonly importer: ProductPriceImportService,
  ) {}

  @ApiOperation({
    summary:
      'Export the retail prices of the products the location sells to XLSX (the last purchase price column needs inventory read access)',
  })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.PRICING))
  @Get('export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @TokenPayload() token: TokenPayloadDto,
    @Res({ passthrough: true }) res: HeaderSetter,
  ): Promise<StreamableFile> {
    return this.stream(
      await this.exporter.export(locationId, this.canReadCost(token, locationId)),
      res,
    );
  }

  @ApiOperation({
    summary: 'Download the product price file template: the export sheet under another name',
  })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.PRICING))
  @Get('template')
  async template(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @TokenPayload() token: TokenPayloadDto,
    @Res({ passthrough: true }) res: HeaderSetter,
  ): Promise<StreamableFile> {
    return this.stream(
      await this.exporter.template(locationId, this.canReadCost(token, locationId)),
      res,
    );
  }

  @ApiOperation({ summary: 'Check a product price file: price changes and row errors' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOkResponse({ type: ApiResponse(ProductPriceImportPreviewDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_IMPORT_FILE_INVALID { reason, columns? }, PRICE_CHANGE_DATE_INVALID, PRICE_CHANGE_TOO_LARGE',
  })
  @ApiPayloadTooLargeResponse({ description: 'PRICE_IMPORT_FILE_TOO_LARGE' })
  @Permissions(Write(Claim.PRICING))
  @ServicePriceImportFile(PRODUCT_PRICE_IMPORT_MAX_BYTES)
  @Post('import/preview')
  async preview(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile() file: ServicePriceImportUpload | undefined,
    @Body() dto: ServicePriceImportRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceImportPreviewDto>> {
    const preview = await this.importer.preview(
      locationId,
      file,
      dto.effectiveDate,
      this.canReadCost(token, locationId),
    );
    return BaseResponseDto.success(ProductPriceImportPreviewDto.fromPreview(preview));
  }

  @ApiOperation({ summary: 'Import a product price file: change retail prices now or from a date' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOkResponse({ type: ApiResponse(ProductPriceImportResultDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_IMPORT_FILE_INVALID, PRICE_IMPORT_INVALID { errorCount, errors }, PRICE_CHANGE_DATE_INVALID, PRICE_CHANGE_TOO_LARGE',
  })
  @ApiConflictResponse({
    description: 'PRICE_CHANGE_DATE_CONFLICT, PRICE_CHANGE_LIMIT',
  })
  @ApiPayloadTooLargeResponse({ description: 'PRICE_IMPORT_FILE_TOO_LARGE' })
  @Permissions(Write(Claim.PRICING))
  @ServicePriceImportFile(PRODUCT_PRICE_IMPORT_MAX_BYTES)
  @Post('import')
  async import(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile() file: ServicePriceImportUpload | undefined,
    @Body() dto: ServicePriceImportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ProductPriceImportResultDto>> {
    const result = await this.importer.import(
      locationId,
      file,
      dto.effectiveDate,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(ProductPriceImportResultDto.fromResult(result));
  }

  /** Purchase prices are shown as numbers only to a user with Read(INVENTORY). */
  private canReadCost(token: TokenPayloadDto, locationId: string): boolean {
    return hasPermission(token, Read(Claim.INVENTORY), locationId);
  }

  private stream(file: XlsxFile, res: HeaderSetter): StreamableFile {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.stream as never, {
      type: XlsxUtils.mimeType,
    });
  }
}
