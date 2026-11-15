import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Auth } from '../../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { PlatformAdminGuard } from '../../../auth/guards/platform-admin.guard.js';
import { AdminSubscriptionDetailsResponseDto } from '../../dto/admin-subscription-details-response.dto.js';
import { AdminSubscriptionItemDto } from '../../dto/admin-subscription-item.dto.js';
import { AdminSubscriptionsRequestDto } from '../../dto/admin-subscriptions-request.dto.js';
import { AdminSubscriptionsResponseDto } from '../../dto/admin-subscriptions-response.dto.js';
import { AssignSubscriptionPlanDto } from '../../dto/assign-subscription-plan.dto.js';
import { BillingReasonDto } from '../../dto/billing-reason.dto.js';
import { ChangeSubscriptionCountryDto } from '../../dto/change-subscription-country.dto.js';
import { ExtendSubscriptionDto } from '../../dto/extend-subscription.dto.js';
import { ExtendTrialDto } from '../../dto/extend-trial.dto.js';
import { ExtendTrialsResponseDto } from '../../dto/extend-trials-response.dto.js';
import { ExtendTrialsDto } from '../../dto/extend-trials.dto.js';
import { RecordSubscriptionPaymentDto } from '../../dto/record-subscription-payment.dto.js';
import { StartSubscriptionDto } from '../../dto/start-subscription.dto.js';
import { AdminSubscriptionDetails } from '../../interfaces/admin-subscription-details.interface.js';
import { AdminSubscriptionBillingService } from '../services/admin-subscription-billing.service.js';
import { AdminSubscriptionLifecycleService } from '../services/admin-subscription-lifecycle.service.js';
import { AdminSubscriptionsQueryService } from '../services/admin-subscriptions-query.service.js';

@ApiTags('Billing administration')
@Controller('admin/billing/subscriptions')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage billing',
})
export class AdminSubscriptionsController {
  constructor(
    private readonly query: AdminSubscriptionsQueryService,
    private readonly lifecycle: AdminSubscriptionLifecycleService,
    private readonly billing: AdminSubscriptionBillingService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Search subscriptions by state, plan, country, dates, open request, limits, brand name or owner email',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionsResponseDto) })
  async search(
    @Query() dto: AdminSubscriptionsRequestDto,
  ): Promise<BaseResponseDto<AdminSubscriptionsResponseDto>> {
    const { items, totalItems } = await this.query.search(dto);
    return BaseResponseDto.success(
      new AdminSubscriptionsResponseDto(
        items.map(AdminSubscriptionItemDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Post('extend-trials')
  @ApiOperation({
    summary:
      'Extend trials of never-paid subscriptions (TRIAL, PAST_DUE, EXPIRED) to a date; dryRun only counts them',
  })
  @ApiOkResponse({ type: ApiResponse(ExtendTrialsResponseDto) })
  async extendTrials(
    @Body() dto: ExtendTrialsDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<ExtendTrialsResponseDto>> {
    const count = await this.lifecycle.extendTrials(dto, payload.sub);
    return BaseResponseDto.success(
      ExtendTrialsResponseDto.of(count, dto.dryRun ?? false),
    );
  }

  @Get(':brandId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Subscription, usage, latest payments and events' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  async findOne(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.query.findSubscription(brandId));
  }

  @Post(':brandId/start')
  @ApiOperation({
    summary:
      'Start a trial for a brand that has no subscription (e.g. a seeded one)',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Brand not found' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_ALREADY_EXISTS' })
  async start(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: StartSubscriptionDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.lifecycle.start(brandId, dto, payload.sub));
  }

  @Post(':brandId/extend-trial')
  @ApiOperation({ summary: 'Extend the trial by days' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  async extendTrial(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ExtendTrialDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.lifecycle.extendTrial(brandId, dto, payload.sub));
  }

  @Post(':brandId/extend')
  @ApiOperation({
    summary:
      'Extend access without payment (days or until a date); recorded as a COMPLIMENTARY payment',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiBadRequestResponse({
    description: 'Exactly one of days and until is required',
  })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_PLAN_REQUIRED' })
  async extend(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ExtendSubscriptionDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.billing.extend(brandId, dto, payload.sub));
  }

  @Post(':brandId/payments')
  @ApiOperation({
    summary:
      'Record a payment received outside the request flow; applied at once',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription or plan not found' })
  @ApiBadRequestResponse({ description: 'SUBSCRIPTION_PAYMENT_DATE_INVALID' })
  async recordPayment(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: RecordSubscriptionPaymentDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.billing.recordPayment(brandId, dto, payload.sub));
  }

  @Put(':brandId/plan')
  @ApiOperation({
    summary:
      'Assign a plan and custom terms; null clears a custom value. A plan change cancels the open request',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription or plan not found' })
  @ApiConflictResponse({ description: 'BILLING_PLAN_NOT_AVAILABLE' })
  async assignPlan(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: AssignSubscriptionPlanDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.billing.assignPlan(brandId, dto, payload.sub));
  }

  @Put(':brandId/country')
  @ApiOperation({ summary: 'Change the pricing country of the subscription' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  async changeCountry(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: ChangeSubscriptionCountryDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(
      this.lifecycle.changeCountry(brandId, dto, payload.sub),
    );
  }

  @Post(':brandId/suspend')
  @ApiOperation({ summary: 'Suspend the brand manually (SUSPENDED)' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  async suspend(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: BillingReasonDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(
      this.lifecycle.suspend(brandId, dto.reason, payload.sub),
    );
  }

  @Post(':brandId/resume')
  @ApiOperation({ summary: 'Lift a manual suspension' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionDetailsResponseDto) })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  async resume(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return this.details(this.lifecycle.resume(brandId, payload.sub));
  }

  private async details(
    pending: Promise<AdminSubscriptionDetails>,
  ): Promise<BaseResponseDto<AdminSubscriptionDetailsResponseDto>> {
    return BaseResponseDto.success(
      AdminSubscriptionDetailsResponseDto.fromDetails(await pending),
    );
  }
}
