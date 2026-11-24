import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { PriceRuleKind } from '@prisma/client';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { XlsxUtils } from '../../../shared/xlsx/xlsx.utils.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { PRICE_RULE_STATS_DAYS } from '../constants/price-rule.constants.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { PriceRuleListRequestDto } from '../dto/price-rule-list-request.dto.js';
import { PriceRulePreviewRequestDto } from '../dto/price-rule-preview-request.dto.js';
import { PriceRulePreviewResponseDto } from '../dto/price-rule-preview-response.dto.js';
import { PriceRuleResponseDto } from '../dto/price-rule-response.dto.js';
import { PriceRuleSummaryRequestDto } from '../dto/price-rule-summary-request.dto.js';
import { PriceRuleSummaryResponseDto } from '../dto/price-rule-summary-response.dto.js';
import { PromoCodeResponseDto } from '../dto/promo-code-response.dto.js';
import { PromotionReportRequestDto } from '../dto/promotion-report-request.dto.js';
import { PromotionReportResponseDto } from '../dto/promotion-report-response.dto.js';
import { SetPriceRuleEnabledDto } from '../dto/set-price-rule-enabled.dto.js';
import { PromotionReportPeriod } from '../enums/promotion-report-period.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { promotionSummary } from '../rules/promotion-summary.rules.js';
import { PriceRulePreviewService } from '../services/price-rule-preview.service.js';
import { PriceRulesService } from '../services/price-rules.service.js';
import { PromotionExportService } from '../services/promotion-export.service.js';

const MS_PER_DAY = 86_400_000;
const REPORT_DAYS: Record<PromotionReportPeriod, number | null> = {
  [PromotionReportPeriod.DAYS_30]: 30,
  [PromotionReportPeriod.DAYS_90]: 90,
  [PromotionReportPeriod.ALL]: null,
};

/**
 * Surcharges and promotions. Responses carry what the bookings made with each rule, which
 * the bookings module owns, so this controller joins the two (pricing depends on no booking code).
 */
@ApiTags('Pricing')
@Controller('locations/:locationId/price-rules')
export class PriceRulesController {
  constructor(
    private readonly rules: PriceRulesService,
    private readonly preview: PriceRulePreviewService,
    private readonly exports: PromotionExportService,
    private readonly bookings: BookingsFacade,
  ) {}

  @ApiOperation({
    summary:
      'List the rules of one kind (surcharges by default); archived=true lists the archived ones',
  })
  @ApiOkResponse({ type: ApiResponseArray(PriceRuleResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: PriceRuleListRequestDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto[]>> {
    const views = await this.rules.list(
      locationId,
      query.archived ?? false,
      query.kind ?? PriceRuleKind.SURCHARGE,
    );
    return BaseResponseDto.success(await this.respondAll(locationId, views));
  }

  @ApiOperation({
    summary:
      'Promotion cards: active and scheduled counts, revenue, discounts, bookings and new clients of the last 30 days',
  })
  @ApiOkResponse({ type: ApiResponse(PriceRuleSummaryResponseDto) })
  @ApiBadRequestResponse({ description: 'kind is not PROMOTION' })
  @Permissions(Read(Claim.PRICING))
  @Get('summary')
  async summary(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: PriceRuleSummaryRequestDto,
  ): Promise<BaseResponseDto<PriceRuleSummaryResponseDto>> {
    if ((query.kind ?? PriceRuleKind.PROMOTION) !== PriceRuleKind.PROMOTION)
      throw new BadRequestException('Only promotions have a summary');
    const now = new Date();
    const monthAgo = new Date(now.getTime() - PRICE_RULE_STATS_DAYS * MS_PER_DAY);
    const twoMonthsAgo = new Date(
      now.getTime() - 2 * PRICE_RULE_STATS_DAYS * MS_PER_DAY,
    );
    const [views, current, previous] = await Promise.all([
      this.rules.list(locationId, false, PriceRuleKind.PROMOTION, now),
      this.bookings.getPromotionTotals(locationId, monthAgo, now),
      this.bookings.getPromotionTotals(locationId, twoMonthsAgo, monthAgo),
    ]);
    return BaseResponseDto.success(
      PriceRuleSummaryResponseDto.fromSummary(
        promotionSummary(views, current, previous),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Preview a rule: status, next date, examples; a surcharge also the surcharges it replaces and holiday conflicts, a promotion its conditions, overlaps and matches of the last 30 days',
  })
  @ApiOkResponse({ type: ApiResponse(PriceRulePreviewResponseDto) })
  @ApiBadRequestResponse({ description: 'PRICE_RULE_INVALID' })
  @ApiConflictResponse({ description: 'PRICE_RULE_ARCHIVED' })
  @Permissions(Read(Claim.PRICING))
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async previewRule(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PriceRulePreviewRequestDto,
  ): Promise<BaseResponseDto<PriceRulePreviewResponseDto>> {
    const preview = await this.preview.preview(
      locationId,
      dto,
      new Date(),
      (from, to) => this.bookings.getPromotionMatchItems(locationId, from, to),
    );
    return BaseResponseDto.success(
      PriceRulePreviewResponseDto.fromPreview(preview),
    );
  }

  @ApiOperation({
    summary:
      'A random free promo code: 8 characters without 0, O, 1, I (nothing is saved)',
  })
  @ApiOkResponse({ type: ApiResponse(PromoCodeResponseDto) })
  @Permissions(Write(Claim.PRICING))
  @Post('promo-code')
  @HttpCode(HttpStatus.OK)
  async promoCode(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<PromoCodeResponseDto>> {
    return BaseResponseDto.success({
      code: await this.rules.generatePromoCode(locationId),
    });
  }

  @ApiOperation({ summary: 'Get a surcharge or a promotion' })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @Permissions(Read(Claim.PRICING))
  @Get(':ruleId')
  async get(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.get(locationId, ruleId),
    );
  }

  @ApiOperation({
    summary:
      'Promotion page: results over 30 or 90 days or all time, staff, returned and not returned clients',
  })
  @ApiOkResponse({ type: ApiResponse(PromotionReportResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @Permissions(Read(Claim.PRICING))
  @Get(':ruleId/report')
  async report(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Query() query: PromotionReportRequestDto,
  ): Promise<BaseResponseDto<PromotionReportResponseDto>> {
    await this.rules.get(locationId, ruleId);
    const now = new Date();
    const days = REPORT_DAYS[query.period ?? PromotionReportPeriod.DAYS_30];
    const since =
      days === null ? null : new Date(now.getTime() - days * MS_PER_DAY);
    return BaseResponseDto.success(
      PromotionReportResponseDto.fromReport(
        await this.bookings.getPromotionReport(locationId, ruleId, since, now),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Export the clients who did not book again 14+ days after a completed promotion visit (xlsx)',
  })
  @ApiProduces(XlsxUtils.mimeType)
  @ApiOkResponse({
    description: 'xlsx: name, phone, email, promotion visit, staff, services',
  })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @Permissions(Read(Claim.PRICING))
  @Get(':ruleId/not-returned/export')
  async exportNotReturned(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Res({ passthrough: true })
    res: { setHeader: (name: string, value: string) => void },
  ): Promise<StreamableFile> {
    await this.rules.get(locationId, ruleId);
    const rows = await this.bookings.getPromotionNotReturned(
      locationId,
      ruleId,
    );
    const { stream, filename } = await this.exports.notReturned(
      locationId,
      rows,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(stream, { type: XlsxUtils.mimeType });
  }

  @ApiOperation({ summary: 'Create a surcharge or a promotion' })
  @ApiCreatedResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiBadRequestResponse({ description: 'PRICE_RULE_INVALID, payload { field }' })
  @ApiConflictResponse({
    description:
      'PRICE_RULE_HOLIDAY_CONFLICT, payload { ruleId, ruleName, date }: an enabled exclusive holiday rule already has the date; PROMO_CODE_TAKEN, payload { ruleId, ruleName }: a live promotion has the promo code',
  })
  @Permissions(Write(Claim.PRICING))
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: PriceRuleInputDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.create(
        locationId,
        dto,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Replace the whole content of a rule (the kind stays); created bookings keep their prices',
  })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiBadRequestResponse({ description: 'PRICE_RULE_INVALID, payload { field }' })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'PRICE_RULE_ARCHIVED, PRICE_RULE_HOLIDAY_CONFLICT or PROMO_CODE_TAKEN',
  })
  @Permissions(Write(Claim.PRICING))
  @Put(':ruleId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: PriceRuleInputDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.update(
        locationId,
        ruleId,
        dto,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Enable or disable a rule' })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PRICE_RULE_ARCHIVED or PRICE_RULE_HOLIDAY_CONFLICT',
  })
  @Permissions(Write(Claim.PRICING))
  @Patch(':ruleId/enabled')
  async setEnabled(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: SetPriceRuleEnabledDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.setEnabled(
        locationId,
        ruleId,
        dto.enabled,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Move a rule to the archive' })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @Permissions(Write(Claim.PRICING))
  @Post(':ruleId/archive')
  async archive(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.archive(
        locationId,
        ruleId,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  @ApiOperation({ summary: 'Bring a rule back from the archive' })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PRICE_RULE_HOLIDAY_CONFLICT or PROMO_CODE_TAKEN',
  })
  @Permissions(Write(Claim.PRICING))
  @Post(':ruleId/restore')
  async restore(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.restore(
        locationId,
        ruleId,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  @ApiOperation({
    summary:
      'Copy a rule: "Name (копия)", disabled; a promotion copy has no promo code',
  })
  @ApiCreatedResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @Permissions(Write(Claim.PRICING))
  @Post(':ruleId/duplicate')
  async duplicate(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    return this.respondOne(
      locationId,
      await this.rules.duplicate(
        locationId,
        ruleId,
        auditActorFromToken(tokenPayload, locationId),
      ),
    );
  }

  private async respondOne(
    locationId: string,
    view: PriceRuleView,
  ): Promise<BaseResponseDto<PriceRuleResponseDto>> {
    const [dto] = await this.respondAll(locationId, [view]);
    return BaseResponseDto.success(dto);
  }

  private async respondAll(
    locationId: string,
    views: PriceRuleView[],
  ): Promise<PriceRuleResponseDto[]> {
    const stats = await this.bookings.getPriceRuleStats(
      locationId,
      views.map((view) => view.rule.id),
    );
    return views.map((view) =>
      PriceRuleResponseDto.fromView(view, stats.get(view.rule.id)),
    );
  }
}
