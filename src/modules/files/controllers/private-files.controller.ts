import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PrivateFileResponseDto } from '../dto/private-file-response.dto.js';
import { PrivateFilesService } from '../services/private-files.service.js';

@ApiTags('Files')
@Controller('private-files')
@Auth()
export class PrivateFilesController {
  constructor(private readonly privateFiles: PrivateFilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      'Upload a private file. Pass its id where a private file is expected (e.g. fileIds of a support request); files not used within 24 hours are deleted',
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
  @ApiOkResponse({ type: ApiResponse(PrivateFileResponseDto) })
  @ApiPayloadTooLargeResponse({ description: 'File exceeds 15 MB limit' })
  @ApiUnprocessableEntityResponse({ description: 'File extension is blocked' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PrivateFileResponseDto>> {
    return BaseResponseDto.success(
      PrivateFileResponseDto.fromSigned(
        await this.privateFiles.upload(file, payload.sub),
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an own private file that is not used yet' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'FILE_IN_USE: already used' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<void> {
    await this.privateFiles.deleteOwn(id, payload.sub);
  }
}
