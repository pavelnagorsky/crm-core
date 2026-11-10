import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { FeedbackResponseDto } from '../dto/feedback-response.dto.js';
import { FeedbackSearchRequestDto } from '../dto/feedback-search-request.dto.js';
import { FeedbackSearchResponseDto } from '../dto/feedback-search-response.dto.js';
import { UpdateFeedbackDto } from '../dto/update-feedback.dto.js';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard.js';
import { FeedbackService } from '../services/feedback.service.js';

@ApiTags('Feedback administration')
@Controller('admin/feedback')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage feedback',
})
export class AdminFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Search feedback, filter by status, paginate and sort; newest first by default',
  })
  @ApiOkResponse({ type: ApiResponse(FeedbackSearchResponseDto) })
  async search(
    @Query() dto: FeedbackSearchRequestDto,
  ): Promise<BaseResponseDto<FeedbackSearchResponseDto>> {
    const { items, totalItems } = await this.feedbackService.search(dto);
    return BaseResponseDto.success(
      new FeedbackSearchResponseDto(
        items.map(FeedbackResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get feedback and internal notes' })
  @ApiOkResponse({ type: ApiResponse(FeedbackResponseDto) })
  @ApiNotFoundResponse({ description: 'Feedback not found' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<FeedbackResponseDto>> {
    return BaseResponseDto.success(
      FeedbackResponseDto.fromEntity(await this.feedbackService.findById(id)),
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change status and/or replace internal notes; null clears notes; any status can be reopened',
  })
  @ApiOkResponse({ type: ApiResponse(FeedbackResponseDto) })
  @ApiNotFoundResponse({ description: 'Feedback not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
  ): Promise<BaseResponseDto<FeedbackResponseDto>> {
    return BaseResponseDto.success(
      FeedbackResponseDto.fromEntity(
        await this.feedbackService.update(id, dto),
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete feedback' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Feedback not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.feedbackService.delete(id);
  }
}
