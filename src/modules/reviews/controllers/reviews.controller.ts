import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { ReviewAdminSummaryDto } from '../dto/review-admin-summary.dto.js';
import { ReviewResponseDto } from '../dto/review-response.dto.js';
import { ReviewSearchRequestDto } from '../dto/review-search-request.dto.js';
import { ReviewSearchResponseDto } from '../dto/review-search-response.dto.js';
import { SaveReviewReplyDto } from '../dto/save-review-reply.dto.js';
import { UpdateReviewVisibilityDto } from '../dto/update-review-visibility.dto.js';
import { ReviewModerationService } from '../services/review-moderation.service.js';

@ApiTags('Reviews')
@Controller('locations/:locationId/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewModerationService) {}

  @ApiOperation({ summary: 'Search reviews of a location' })
  @ApiOkResponse({ type: ApiResponse(ReviewSearchResponseDto) })
  @Permissions(Read(Claim.REVIEW))
  @Get()
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ReviewSearchRequestDto,
  ): Promise<BaseResponseDto<ReviewSearchResponseDto>> {
    const { items, totalItems } = await this.reviews.search(locationId, dto);
    return BaseResponseDto.success(
      new ReviewSearchResponseDto(
        items.map(ReviewResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({
    summary: 'Rating summary of a location with moderation counters',
  })
  @ApiOkResponse({ type: ApiResponse(ReviewAdminSummaryDto) })
  @Permissions(Read(Claim.REVIEW))
  @Get('summary')
  async getSummary(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<ReviewAdminSummaryDto>> {
    return BaseResponseDto.success(
      ReviewAdminSummaryDto.fromEntity(
        await this.reviews.getSummary(locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Get a review' })
  @ApiOkResponse({ type: ApiResponse(ReviewResponseDto) })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @Permissions(Read(Claim.REVIEW))
  @Get(':reviewId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ): Promise<BaseResponseDto<ReviewResponseDto>> {
    return BaseResponseDto.success(
      ReviewResponseDto.fromEntity(
        await this.reviews.findById(locationId, reviewId),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Hide a review from the public or publish it again; hiding needs a reason',
  })
  @ApiOkResponse({ type: ApiResponse(ReviewResponseDto) })
  @ApiBadRequestResponse({ description: 'REVIEW_HIDE_REASON_REQUIRED' })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @Permissions(Write(Claim.REVIEW))
  @Patch(':reviewId/visibility')
  async setVisibility(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateReviewVisibilityDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ReviewResponseDto>> {
    return BaseResponseDto.success(
      ReviewResponseDto.fromEntity(
        await this.reviews.setVisibility(
          locationId,
          reviewId,
          dto,
          auditActorFromToken(token, locationId),
        ),
      ),
    );
  }

  @ApiOperation({ summary: 'Reply to a review or replace the reply' })
  @ApiOkResponse({ type: ApiResponse(ReviewResponseDto) })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @Permissions(Write(Claim.REVIEW))
  @Put(':reviewId/reply')
  async saveReply(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: SaveReviewReplyDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<ReviewResponseDto>> {
    return BaseResponseDto.success(
      ReviewResponseDto.fromEntity(
        await this.reviews.saveReply(
          locationId,
          reviewId,
          dto.text,
          auditActorFromToken(token, locationId),
        ),
      ),
    );
  }

  @ApiOperation({ summary: 'Delete the reply to a review' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    description: 'REVIEW_NOT_FOUND or REVIEW_REPLY_NOT_FOUND',
  })
  @Permissions(Write(Claim.REVIEW))
  @Delete(':reviewId/reply')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReply(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<void> {
    await this.reviews.deleteReply(
      locationId,
      reviewId,
      auditActorFromToken(token, locationId),
    );
  }

  @ApiOperation({
    summary:
      'Delete a review permanently. The client cannot leave another review for the same visit link',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @Permissions(Write(Claim.REVIEW))
  @Delete(':reviewId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<void> {
    await this.reviews.delete(
      locationId,
      reviewId,
      auditActorFromToken(token, locationId),
    );
  }
}
