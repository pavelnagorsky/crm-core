import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read, Write } from '../../../access/utils/permission.js';
import { Auth } from '../../../auth/decorators/auth.decorator.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { BrandSubscriptionResponseDto } from '../../dto/brand-subscription-response.dto.js';
import { CreateSubscriptionPaymentDto } from '../../dto/create-subscription-payment.dto.js';
import { PaymentQuoteRequestDto } from '../../dto/payment-quote-request.dto.js';
import { PaymentQuoteResponseDto } from '../../dto/payment-quote-response.dto.js';
import { PlanChangeQuoteResponseDto } from '../../dto/plan-change-quote-response.dto.js';
import { PlanChangeRequestDto } from '../../dto/plan-change-request.dto.js';
import { SubscriptionEventDto } from '../../dto/subscription-event.dto.js';
import { SubscriptionEventsRequestDto } from '../../dto/subscription-events-request.dto.js';
import { SubscriptionEventsResponseDto } from '../../dto/subscription-events-response.dto.js';
import { SubscriptionPaymentWithNextActionResponseDto } from '../../dto/subscription-payment-with-next-action-response.dto.js';
import { SubscriptionPaymentDto } from '../../dto/subscription-payment.dto.js';
import { SubscriptionPaymentsRequestDto } from '../../dto/subscription-payments-request.dto.js';
import { SubscriptionPaymentsResponseDto } from '../../dto/subscription-payments-response.dto.js';
import { BrandPaymentRequestService } from '../services/brand-payment-request.service.js';
import { BrandPlanChangeService } from '../services/brand-plan-change.service.js';
import { BrandSubscriptionQueryService } from '../services/brand-subscription-query.service.js';

@ApiTags('Subscription')
@Controller('brands/:brandId/subscription')
@Auth()
export class BrandSubscriptionController {
  constructor(
    private readonly query: BrandSubscriptionQueryService,
    private readonly paymentRequests: BrandPaymentRequestService,
    private readonly planChanges: BrandPlanChangeService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({
    summary: 'Subscription state, limits, usage and the open request',
  })
  @ApiOkResponse({ type: ApiResponse(BrandSubscriptionResponseDto) })
  async details(
    @Param('brandId', ParseUUIDPipe) brandId: string,
  ): Promise<BaseResponseDto<BrandSubscriptionResponseDto>> {
    return BaseResponseDto.success(
      BrandSubscriptionResponseDto.fromEntity(
        await this.query.details(brandId),
      ),
    );
  }

  @Get('payment-quote')
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({
    summary:
      'Amount, currency and the period a payment made today would give; allowed=false when the plan does not fit the usage',
  })
  @ApiOkResponse({ type: ApiResponse(PaymentQuoteResponseDto) })
  @ApiConflictResponse({
    description:
      'SUBSCRIPTION_NOT_STARTED, BILLING_PLAN_NOT_AVAILABLE, BILLING_PLAN_PRICE_MISSING',
  })
  async paymentQuote(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: PaymentQuoteRequestDto,
  ): Promise<BaseResponseDto<PaymentQuoteResponseDto>> {
    return BaseResponseDto.success(
      PaymentQuoteResponseDto.fromEntity(
        await this.paymentRequests.quote(brandId, dto),
      ),
    );
  }

  @Post('payments')
  @Permissions(Write(Claim.BILLING))
  @ApiOperation({
    summary:
      'Request a payment; an open request of the brand is cancelled. nextAction tells the client what to show',
  })
  @ApiOkResponse({
    type: ApiResponse(SubscriptionPaymentWithNextActionResponseDto),
  })
  @ApiConflictResponse({
    description:
      'SUBSCRIPTION_NOT_STARTED, BILLING_PLAN_NOT_AVAILABLE, BILLING_PLAN_PRICE_MISSING, PLAN_USAGE_EXCEEDS_LIMITS',
  })
  async requestPayment(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: CreateSubscriptionPaymentDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<SubscriptionPaymentWithNextActionResponseDto>> {
    return BaseResponseDto.success(
      SubscriptionPaymentWithNextActionResponseDto.fromEntity(
        await this.paymentRequests.request(brandId, dto, payload.sub),
      ),
    );
  }

  @Get('payments')
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({ summary: 'Payment history, newest first by default' })
  @ApiOkResponse({ type: ApiResponse(SubscriptionPaymentsResponseDto) })
  async payments(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: SubscriptionPaymentsRequestDto,
  ): Promise<BaseResponseDto<SubscriptionPaymentsResponseDto>> {
    const { items, totalItems } = await this.query.paymentHistory(brandId, dto);
    return BaseResponseDto.success(
      new SubscriptionPaymentsResponseDto(
        items.map(SubscriptionPaymentDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Get('payments/:id')
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({ summary: 'A payment and what the client should show for it' })
  @ApiOkResponse({
    type: ApiResponse(SubscriptionPaymentWithNextActionResponseDto),
  })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  async findPayment(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<SubscriptionPaymentWithNextActionResponseDto>> {
    return BaseResponseDto.success(
      SubscriptionPaymentWithNextActionResponseDto.fromEntity(
        await this.query.findPayment(brandId, id),
      ),
    );
  }

  @Post('payments/:id/cancel')
  @Permissions(Write(Claim.BILLING))
  @ApiOperation({ summary: 'Cancel a PENDING request' })
  @ApiOkResponse({ type: ApiResponse(SubscriptionPaymentDto) })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_PAYMENT_NOT_CANCELABLE' })
  async cancelPayment(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<SubscriptionPaymentDto>> {
    return BaseResponseDto.success(
      SubscriptionPaymentDto.fromEntity(
        await this.paymentRequests.cancel(brandId, id, payload.sub),
      ),
    );
  }

  @Get('plan-change-quote')
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({
    summary:
      'New end of the paid period after a plan change; allowed=false when the plan does not fit',
  })
  @ApiOkResponse({ type: ApiResponse(PlanChangeQuoteResponseDto) })
  @ApiConflictResponse({
    description:
      'SUBSCRIPTION_NOT_STARTED, SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT, SUBSCRIPTION_NO_PAID_PERIOD, BILLING_PLAN_NOT_AVAILABLE, BILLING_PLAN_PRICE_MISSING',
  })
  async planChangeQuote(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: PlanChangeRequestDto,
  ): Promise<BaseResponseDto<PlanChangeQuoteResponseDto>> {
    return BaseResponseDto.success(
      PlanChangeQuoteResponseDto.fromEntity(
        await this.planChanges.quote(brandId, dto),
      ),
    );
  }

  @Post('plan-change')
  @Permissions(Write(Claim.BILLING))
  @ApiOperation({
    summary:
      'Change the plan within the paid period; the remainder is converted, the open request is cancelled',
  })
  @ApiOkResponse({ type: ApiResponse(BrandSubscriptionResponseDto) })
  @ApiConflictResponse({
    description:
      'SUBSCRIPTION_NOT_STARTED, SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT, SUBSCRIPTION_NO_PAID_PERIOD, BILLING_PLAN_NOT_AVAILABLE, BILLING_PLAN_PRICE_MISSING, PLAN_USAGE_EXCEEDS_LIMITS',
  })
  async changePlan(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Body() dto: PlanChangeRequestDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BrandSubscriptionResponseDto>> {
    return BaseResponseDto.success(
      BrandSubscriptionResponseDto.fromEntity(
        await this.planChanges.change(brandId, dto, payload.sub),
      ),
    );
  }

  @Get('events')
  @Header('Cache-Control', 'no-store')
  @Permissions(Read(Claim.BILLING))
  @ApiOperation({ summary: 'Subscription history, newest first by default' })
  @ApiOkResponse({ type: ApiResponse(SubscriptionEventsResponseDto) })
  async events(
    @Param('brandId', ParseUUIDPipe) brandId: string,
    @Query() dto: SubscriptionEventsRequestDto,
  ): Promise<BaseResponseDto<SubscriptionEventsResponseDto>> {
    const { items, totalItems } = await this.query.events(brandId, dto);
    return BaseResponseDto.success(
      new SubscriptionEventsResponseDto(
        items.map(SubscriptionEventDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }
}
