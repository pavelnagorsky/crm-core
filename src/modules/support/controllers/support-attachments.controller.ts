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
import { SupportAttachmentUploadResponseDto } from '../dto/support-attachment-upload-response.dto.js';
import { SupportService } from '../services/support.service.js';

@ApiTags('Support')
@Controller('support-requests/attachments')
@Auth()
export class SupportAttachmentsController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({
    summary:
      'Upload a private attachment for a support request; send its id in fileIds. Unsent attachments are deleted after 24 hours',
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
  @ApiOkResponse({ type: ApiResponse(SupportAttachmentUploadResponseDto) })
  @ApiPayloadTooLargeResponse({ description: 'File exceeds 15 MB limit' })
  @ApiUnprocessableEntityResponse({ description: 'File extension is blocked' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<SupportAttachmentUploadResponseDto>> {
    return BaseResponseDto.success(
      SupportAttachmentUploadResponseDto.fromEntity(
        await this.supportService.uploadAttachment(file, payload.sub),
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an own attachment that is not sent yet' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'FILE_IN_USE: already sent with a request',
  })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<void> {
    await this.supportService.deleteAttachment(id, payload.sub);
  }
}
