import {
  Controller,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiPayloadTooLargeResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { FilesService } from './files.service.js';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { BaseResponseDto, ApiResponse } from '../../shared/dto/base-response.dto.js';
import { UploadFileResponseDto } from './dto/upload-file-response.dto.js';

@ApiTags('Files')
@Controller('businesses/:businessId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload a file to Google Cloud Storage' })
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
  @ApiOkResponse({ type: ApiResponse(UploadFileResponseDto) })
  @ApiPayloadTooLargeResponse({ description: 'File exceeds 15 MB limit' })
  @ApiUnprocessableEntityResponse({ description: 'File type not allowed' })
  async upload(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @UploadedFile() file: Express.Multer.File,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<UploadFileResponseDto>> {
    const saved = await this.filesService.upload(file, payload.sub, businessId);
    return BaseResponseDto.success(UploadFileResponseDto.fromEntity(saved));
  }

  @Delete(':fileId')
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file' })
  @ApiNoContentResponse({ description: 'File deleted' })
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<void> {
    await this.filesService.delete(fileId, businessId);
  }
}
