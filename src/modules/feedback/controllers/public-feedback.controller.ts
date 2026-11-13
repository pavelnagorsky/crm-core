import { Body, Controller, Header, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { CreateFeedbackDto } from '../dto/create-feedback.dto.js';
import { FeedbackService } from '../services/feedback.service.js';
import { StrictRateLimit } from '../../../shared/decorators/strict-rate-limit.decorator.js';

@ApiTags('Feedback')
@Controller('public/feedback')
export class PublicFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @StrictRateLimit()
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Submit feedback without registration; name and at least one contact required',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiBadRequestResponse({
    description: 'Invalid form or missing phone and email',
  })
  async create(
    @Body() dto: CreateFeedbackDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const feedback = await this.feedbackService.create(dto);
    return BaseResponseDto.success({ id: feedback.id });
  }
}
