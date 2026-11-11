import {
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
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Write } from '../../../access/utils/permission.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { ReviewImportFile } from '../decorators/review-import-file.decorator.js';
import { ReviewImportResponseDto } from '../dto/review-import-response.dto.js';
import { ReviewImportTemplateService } from '../services/review-import-template.service.js';
import { ReviewImportService } from '../services/review-import.service.js';

@ApiTags('Reviews')
@Controller('locations/:locationId/reviews/import')
export class ReviewImportController {
  constructor(
    private readonly reviewImport: ReviewImportService,
    private readonly template: ReviewImportTemplateService,
  ) {}

  @ApiOperation({
    summary: 'Download the xlsx template for importing reviews',
  })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({ description: 'File stream' })
  @Permissions(Write(Claim.REVIEW_IMPORT))
  @Get('template')
  getTemplate(
    @Param('locationId', ParseUUIDPipe) _locationId: string,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): StreamableFile {
    const { stream, filename } = this.template.build();
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({
    summary:
      'Import reviews from another system. Valid rows are saved at once, invalid rows are listed with their row numbers',
  })
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
  @ApiOkResponse({ type: ApiResponse(ReviewImportResponseDto) })
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
  @Permissions(Write(Claim.REVIEW_IMPORT))
  @ReviewImportFile()
  @Post()
  async import(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ReviewImportResponseDto>> {
    const result = await this.reviewImport.import(
      locationId,
      file,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(ReviewImportResponseDto.fromEntity(result));
  }
}
