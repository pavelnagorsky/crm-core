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
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Auth } from '../../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { PlatformAdminGuard } from '../../../auth/guards/platform-admin.guard.js';
import { AdminBillingPlanDto } from '../../dto/admin-billing-plan.dto.js';
import { BillingCountryDto } from '../../dto/billing-country.dto.js';
import { BillingPlanPriceDto } from '../../dto/billing-plan-price.dto.js';
import { BillingPlanPricesRequestDto } from '../../dto/billing-plan-prices-request.dto.js';
import { BillingPlanUpdateResponseDto } from '../../dto/billing-plan-update-response.dto.js';
import { CreateBillingPlanPriceDto } from '../../dto/create-billing-plan-price.dto.js';
import { CreateBillingPlanDto } from '../../dto/create-billing-plan.dto.js';
import { UpdateBillingPlanDto } from '../../dto/update-billing-plan.dto.js';
import { AdminBillingPlansService } from '../services/admin-billing-plans.service.js';
import { BillingPlanService } from '../../plans/services/billing-plan.service.js';

@ApiTags('Billing administration')
@Controller('admin/billing')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage billing',
})
export class AdminBillingPlansController {
  constructor(
    private readonly adminPlans: AdminBillingPlansService,
    private readonly plans: BillingPlanService,
  ) {}

  @Get('plans')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'All plans with prices in force, scheduled prices and the number of subscriptions',
  })
  @ApiOkResponse({ type: ApiResponseArray(AdminBillingPlanDto) })
  async findPlans(): Promise<BaseResponseDto<AdminBillingPlanDto[]>> {
    const plans = await this.adminPlans.findAll();
    return BaseResponseDto.success(plans.map(AdminBillingPlanDto.fromEntity));
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a plan' })
  @ApiOkResponse({ type: ApiResponse(AdminBillingPlanDto) })
  @ApiConflictResponse({ description: 'BILLING_PLAN_CODE_EXISTS' })
  async createPlan(
    @Body() dto: CreateBillingPlanDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminBillingPlanDto>> {
    return BaseResponseDto.success(
      AdminBillingPlanDto.fromEntity(
        await this.adminPlans.create(dto, payload.sub),
      ),
    );
  }

  @Patch('plans/:id')
  @ApiOperation({
    summary:
      'Update a plan; overLimitSubscriptions tells how many subscriptions the new limits put over the limit',
  })
  @ApiOkResponse({ type: ApiResponse(BillingPlanUpdateResponseDto) })
  @ApiNotFoundResponse({ description: 'Billing plan not found' })
  @ApiConflictResponse({ description: 'BILLING_PLAN_LAST_PUBLIC' })
  async updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingPlanDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BillingPlanUpdateResponseDto>> {
    return BaseResponseDto.success(
      BillingPlanUpdateResponseDto.fromResult(
        await this.adminPlans.update(id, dto, payload.sub),
      ),
    );
  }

  @Post('plans/:id/archive')
  @ApiOperation({ summary: 'Archive a plan; subscriptions on it stay' })
  @ApiOkResponse({ type: ApiResponse(AdminBillingPlanDto) })
  @ApiNotFoundResponse({ description: 'Billing plan not found' })
  @ApiConflictResponse({ description: 'BILLING_PLAN_LAST_PUBLIC' })
  async archivePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminBillingPlanDto>> {
    return BaseResponseDto.success(
      AdminBillingPlanDto.fromEntity(
        await this.adminPlans.archive(id, payload.sub),
      ),
    );
  }

  @Post('plans/:id/restore')
  @ApiOperation({ summary: 'Restore an archived plan' })
  @ApiOkResponse({ type: ApiResponse(AdminBillingPlanDto) })
  @ApiNotFoundResponse({ description: 'Billing plan not found' })
  async restorePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminBillingPlanDto>> {
    return BaseResponseDto.success(
      AdminBillingPlanDto.fromEntity(
        await this.adminPlans.restore(id, payload.sub),
      ),
    );
  }

  @Get('plans/:id/prices')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'All price versions of a plan, optionally of one country',
  })
  @ApiOkResponse({ type: ApiResponseArray(BillingPlanPriceDto) })
  @ApiNotFoundResponse({ description: 'Billing plan not found' })
  async findPrices(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: BillingPlanPricesRequestDto,
  ): Promise<BaseResponseDto<BillingPlanPriceDto[]>> {
    const prices = await this.plans.findPrices(id, dto.countryCode);
    return BaseResponseDto.success(prices.map(BillingPlanPriceDto.fromEntity));
  }

  @Post('plans/:id/prices')
  @ApiOperation({
    summary:
      'Add a price version; the currency is the country currency, effectiveFrom is not in the past (default: now)',
  })
  @ApiOkResponse({ type: ApiResponse(BillingPlanPriceDto) })
  @ApiNotFoundResponse({ description: 'Billing plan not found' })
  @ApiBadRequestResponse({
    description:
      'BILLING_PRICE_EFFECTIVE_FROM_PAST, BILLING_PRICE_CURRENCY_MISMATCH',
  })
  async addPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBillingPlanPriceDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BillingPlanPriceDto>> {
    return BaseResponseDto.success(
      BillingPlanPriceDto.fromEntity(
        await this.plans.addPrice(id, dto, payload.sub),
      ),
    );
  }

  @Delete('plans/:id/prices/:priceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a future price version' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Price not found' })
  @ApiConflictResponse({ description: 'BILLING_PRICE_ALREADY_EFFECTIVE' })
  async deletePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('priceId', ParseUUIDPipe) priceId: string,
  ): Promise<void> {
    await this.plans.deletePrice(id, priceId);
  }

  @Get('countries')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Countries with prices or subscriptions, and the default country',
  })
  @ApiOkResponse({ type: ApiResponseArray(BillingCountryDto) })
  async countries(): Promise<BaseResponseDto<BillingCountryDto[]>> {
    const countries = await this.adminPlans.countries();
    return BaseResponseDto.success(countries.map(BillingCountryDto.fromEntity));
  }
}
