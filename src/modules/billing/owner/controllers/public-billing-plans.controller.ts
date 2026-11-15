import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PublicRateLimit } from '../../../../shared/decorators/public-rate-limit.decorator.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { PublicBillingPlansRequestDto } from '../../dto/public-billing-plans-request.dto.js';
import { PublicBillingPlansResponseDto } from '../../dto/public-billing-plans-response.dto.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';

@ApiTags('Public billing')
@Controller('public/billing')
@PublicRateLimit()
export class PublicBillingPlansController {
  constructor(
    private readonly access: SubscriptionAccessService,
    private readonly settings: BillingSettingsService,
  ) {}

  @Get('plans')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
  @ApiOperation({
    summary:
      'Public plans and prices of a country; a country without its own prices gets the default country prices',
  })
  @ApiOkResponse({ type: ApiResponse(PublicBillingPlansResponseDto) })
  @ApiBadRequestResponse({ description: 'Invalid country code' })
  async findPlans(
    @Query() dto: PublicBillingPlansRequestDto,
  ): Promise<BaseResponseDto<PublicBillingPlansResponseDto>> {
    const [catalog, settings] = await Promise.all([
      this.access.catalog(dto.country),
      this.settings.get(),
    ]);
    return BaseResponseDto.success(
      PublicBillingPlansResponseDto.fromEntity(catalog, settings.trialDays),
    );
  }
}
