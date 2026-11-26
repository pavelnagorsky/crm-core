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
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { ServicePriceImportFile } from '../decorators/service-price-import-upload.decorator.js';
import { ServicePriceImportPreviewDto } from '../dto/service-price-import-preview.dto.js';
import { ServicePriceImportRequestDto } from '../dto/service-price-import-request.dto.js';
import { ServicePriceImportResultDto } from '../dto/service-price-import-result.dto.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { ServicePriceExportService } from '../services/service-price-export.service.js';
import { ServicePriceImportService } from '../services/service-price-import.service.js';

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

/** Prices in Excel: the current prices, the template, the checked upload and the upload. */
@ApiTags('Pricing')
@Controller('locations/:locationId/service-prices')
export class ServicePriceImportController {
  constructor(
    private readonly exporter: ServicePriceExportService,
    private readonly importer: ServicePriceImportService,
  ) {}

  @ApiOperation({ summary: 'Export the prices of services and bundles to XLSX' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.PRICING))
  @Get('export')
  async export(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Res({ passthrough: true }) res: HeaderSetter,
  ): Promise<StreamableFile> {
    return this.stream(await this.exporter.export(locationId), res);
  }

  @ApiOperation({ summary: 'Download the price file template' })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Read(Claim.PRICING))
  @Get('template')
  async template(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Res({ passthrough: true }) res: HeaderSetter,
  ): Promise<StreamableFile> {
    return this.stream(await this.exporter.template(locationId), res);
  }

  @ApiOperation({
    summary: 'Check a price file: new services, price changes and row errors',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOkResponse({ type: ApiResponse(ServicePriceImportPreviewDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_IMPORT_FILE_INVALID { reason, sheet?, columns? }, PRICE_CHANGE_DATE_INVALID, PRICE_CHANGE_TOO_LARGE',
  })
  @ApiPayloadTooLargeResponse({
    description: 'PRICE_IMPORT_FILE_TOO_LARGE',
  })
  @Permissions(Write(Claim.PRICING))
  @ServicePriceImportFile()
  @Post('import/preview')
  async preview(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile() file: ServicePriceImportUpload | undefined,
    @Body() dto: ServicePriceImportRequestDto,
  ): Promise<BaseResponseDto<ServicePriceImportPreviewDto>> {
    const preview = await this.importer.preview(
      locationId,
      file,
      dto.effectiveDate,
    );
    return BaseResponseDto.success(
      ServicePriceImportPreviewDto.fromPreview(preview),
    );
  }

  @ApiOperation({
    summary: 'Import a price file: create new services and change prices',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiOkResponse({ type: ApiResponse(ServicePriceImportResultDto) })
  @ApiBadRequestResponse({
    description:
      'PRICE_IMPORT_FILE_INVALID, PRICE_IMPORT_INVALID { errorCount, errors }, PRICE_CHANGE_DATE_INVALID, PRICE_CHANGE_TOO_LARGE',
  })
  @ApiForbiddenResponse({
    description:
      'SERVICE_PRICE_IMPORT_SERVICE_ACCESS: new services need service write access',
  })
  @ApiConflictResponse({
    description:
      'PRICE_CHANGE_DATE_CONFLICT, PRICE_CHANGE_LIMIT',
  })
  @ApiPayloadTooLargeResponse({
    description: 'PRICE_IMPORT_FILE_TOO_LARGE',
  })
  @Permissions(Write(Claim.PRICING))
  @ServicePriceImportFile()
  @Post('import')
  async import(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile() file: ServicePriceImportUpload | undefined,
    @Body() dto: ServicePriceImportRequestDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ServicePriceImportResultDto>> {
    const result = await this.importer.import(
      locationId,
      file,
      dto.effectiveDate,
      auditActorFromToken(tokenPayload, locationId),
      tokenPayload,
    );
    return BaseResponseDto.success(ServicePriceImportResultDto.fromResult(result));
  }

  private stream(
    file: { stream: NodeJS.ReadableStream; filename: string },
    res: HeaderSetter,
  ): StreamableFile {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(file.stream as never, {
      type: XlsxUtils.mimeType,
    });
  }
}
