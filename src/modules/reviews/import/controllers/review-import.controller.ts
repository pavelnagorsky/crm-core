import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Write } from '../../../access/utils/permission.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { ReviewImportFile } from '../decorators/review-import-file.decorator.js';
import { ReviewImportResponseDto } from '../dto/review-import-response.dto.js';
import { ReviewImportService } from '../services/review-import.service.js';

@ApiTags('Reviews')
@Controller('locations/:locationId/reviews/import')
export class ReviewImportController {
  constructor(private readonly reviewImport: ReviewImportService) {}

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
