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
import { FilesService } from './files.service.js';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import {
  BaseResponseDto,
  ApiResponse,
} from '../../shared/dto/base-response.dto.js';
import { UploadFileResponseDto } from './dto/upload-file-response.dto.js';
import { Permission } from '../access/enums/permission.enum.js';
import { Permissions } from '../auth/decorators/permissions.decorator.js';

@ApiTags('Files')
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('brands/:brandId/files')
  @Permissions(Permission.FILE_BRAND_MANAGE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload a brand file to Google Cloud Storage' })
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
  @ApiUnprocessableEntityResponse({ description: 'File extension is blocked' })
  async uploadForBrand(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @UploadedFile() file: Express.Multer.File,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<UploadFileResponseDto>> {
    const saved = await this.filesService.uploadForBrand(
      file,
      payload.sub,
      brandId,
    );
    return BaseResponseDto.success(UploadFileResponseDto.fromEntity(saved));
  }

  @Post('users/me/files')
  @Auth()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Upload a personal file to Google Cloud Storage' })
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
  @ApiUnprocessableEntityResponse({ description: 'File extension is blocked' })
  async uploadForUser(
    @UploadedFile() file: Express.Multer.File,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<UploadFileResponseDto>> {
    const saved = await this.filesService.uploadForUser(file, payload.sub);
    return BaseResponseDto.success(UploadFileResponseDto.fromEntity(saved));
  }

  @Delete('brands/:brandId/files/:fileId')
  @Permissions(Permission.FILE_BRAND_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a brand file' })
  @ApiNoContentResponse({ description: 'File deleted' })
  async deleteFromBrand(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ): Promise<void> {
    await this.filesService.deleteInBrand(fileId, brandId);
  }

  @Delete('users/me/files/:fileId')
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a personal file' })
  @ApiNoContentResponse({ description: 'File deleted' })
  async deleteFromUser(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<void> {
    await this.filesService.deleteInUser(fileId, payload.sub);
  }
}
