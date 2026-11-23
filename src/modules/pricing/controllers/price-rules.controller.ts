import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { PriceRuleListRequestDto } from '../dto/price-rule-list-request.dto.js';
import { PriceRuleInputDto } from '../dto/price-rule-input.dto.js';
import { PriceRuleResponseDto } from '../dto/price-rule-response.dto.js';
import { SetPriceRuleEnabledDto } from '../dto/set-price-rule-enabled.dto.js';
import { PriceRuleSurchargeStats } from '../interfaces/price-rule-surcharge-stats.interface.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PriceRulesService } from '../services/price-rules.service.js';

/**
 * Surcharge rules. The response carries what the bookings made with each rule added, which
 * the bookings module owns, so this controller joins the two (pricing depends on no booking code).
 */
@ApiTags('Pricing')
@Controller('locations/:locationId/price-rules')
export class PriceRulesController {
  constructor(
    private readonly rules: PriceRulesService,
    private readonly bookings: BookingsFacade,
  ) {}

  @ApiOperation({
    summary: 'List the surcharge rules; archived=true lists the archived ones',
  })
  @ApiOkResponse({ type: ApiResponseArray(PriceRuleResponseDto) })
  @Permissions(Read(Claim.PRICING))
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: PriceRuleListRequestDto,
  ): Promise<BaseResponseDto<PriceRuleResponseDto[]>> {
    const views = await this.rules.list(locationId, query.archived ?? false);
    return BaseResponseDto.success(await this.respondAll(locationId, views));
  }

  @ApiOperation({ summary: 'Get a surcharge rule' })
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

  @ApiOperation({ summary: 'Create a surcharge rule' })
  @ApiCreatedResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiConflictResponse({
    description:
      'PRICE_RULE_HOLIDAY_CONFLICT, payload { ruleId, ruleName, date }: an enabled exclusive holiday rule already has the date',
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
      'Replace the whole content of a surcharge rule; created bookings keep their prices',
  })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'PRICE_RULE_ARCHIVED or PRICE_RULE_HOLIDAY_CONFLICT',
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

  @ApiOperation({ summary: 'Enable or disable a surcharge rule' })
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

  @ApiOperation({ summary: 'Move a surcharge rule to the archive' })
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

  @ApiOperation({ summary: 'Bring a surcharge rule back from the archive' })
  @ApiOkResponse({ type: ApiResponse(PriceRuleResponseDto) })
  @ApiNotFoundResponse({ description: 'PRICE_RULE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PRICE_RULE_HOLIDAY_CONFLICT' })
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
    summary: 'Copy a surcharge rule: "Name (копия)", disabled',
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
    const stats: Map<string, PriceRuleSurchargeStats> =
      await this.bookings.getPriceRuleSurchargeStats(
        locationId,
        views.map((view) => view.rule.id),
      );
    return views.map((view) =>
      PriceRuleResponseDto.fromView(view, stats.get(view.rule.id)),
    );
  }
}
