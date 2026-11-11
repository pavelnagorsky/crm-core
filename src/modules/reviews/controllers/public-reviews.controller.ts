import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { PUBLIC_REVIEWS_CACHE_SECONDS } from '../constants/reviews.constants.js';
import { PublicReviewDto } from '../dto/public-review.dto.js';
import { PublicReviewListRequestDto } from '../dto/public-review-list-request.dto.js';
import { PublicReviewListResponseDto } from '../dto/public-review-list-response.dto.js';
import { ReviewSummaryDto } from '../dto/review-summary.dto.js';
import { ReviewAggregatesService } from '../services/review-aggregates.service.js';
import { ReviewsService } from '../services/reviews.service.js';

@ApiTags('Reviews')
@Controller('public/locations/:locationId/reviews')
export class PublicReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly aggregates: ReviewAggregatesService,
    private readonly locations: LocationService,
  ) {}

  @ApiOperation({
    summary: 'List published reviews of a location, newest first by default',
  })
  @ApiOkResponse({ type: ApiResponse(PublicReviewListResponseDto) })
  @ApiNotFoundResponse({
    description: 'Location not found or reviews are disabled for it',
  })
  @Get()
  @Header(
    'Cache-Control',
    `public, max-age=${PUBLIC_REVIEWS_CACHE_SECONDS}, s-maxage=${PUBLIC_REVIEWS_CACHE_SECONDS}`,
  )
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: PublicReviewListRequestDto,
  ): Promise<BaseResponseDto<PublicReviewListResponseDto>> {
    const settings = await this.locations.getBookingSettings(locationId);
    if (!settings.reviewsEnabled)
      throw new NotFoundException('Reviews not found');
    const [{ items, totalItems }, summary] = await Promise.all([
      this.reviews.listPublished(locationId, {
        page: dto.page,
        pageSize: dto.pageSize,
        staffId: dto.staffId,
        rating: dto.rating,
        orderBy: dto.orderBy,
        orderDirection: dto.orderDirection,
      }),
      dto.staffId
        ? this.aggregates.getStaffSummary(locationId, dto.staffId)
        : this.aggregates.getLocationSummary(locationId),
    ]);
    return BaseResponseDto.success(
      new PublicReviewListResponseDto(
        items.map(PublicReviewDto.fromEntity),
        ReviewSummaryDto.fromSummary(summary),
        dto.page,
        dto.pageSize,
        totalItems,
      ),
    );
  }
}
