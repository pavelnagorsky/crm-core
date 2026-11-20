import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Auth } from '../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard.js';
import { EmailBulkRequestDto } from '../dto/email-bulk-request.dto.js';
import { EmailBulkResultDto } from '../dto/email-bulk-result.dto.js';
import { EmailFilterDto } from '../dto/email-filter.dto.js';
import { EmailMessageDetailsDto } from '../dto/email-message-details.dto.js';
import { EmailMessageDto } from '../dto/email-message.dto.js';
import { EmailOverviewRequestDto } from '../dto/email-overview-request.dto.js';
import { EmailOverviewDto } from '../dto/email-overview.dto.js';
import { EmailPreviewDto } from '../dto/email-preview.dto.js';
import { EmailSearchRequestDto } from '../dto/email-search-request.dto.js';
import { EmailSearchResponseDto } from '../dto/email-search-response.dto.js';
import { EmailSettingsDto } from '../dto/email-settings.dto.js';
import { EmailStatusCountDto } from '../dto/email-status-count.dto.js';
import { EmailTestRequestDto } from '../dto/email-test-request.dto.js';
import { EmailTestResultDto } from '../dto/email-test-result.dto.js';
import { EmailAdminService } from '../services/email-admin.service.js';

@ApiTags('Notifications administration')
@Controller('admin/notifications/emails')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can see the email log',
})
export class AdminEmailsController {
  constructor(private readonly emails: EmailAdminService) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'SMTP health, KPIs, chart series, types and frequent errors',
  })
  @ApiOkResponse({ type: ApiResponse(EmailOverviewDto) })
  async overview(
    @Query() dto: EmailOverviewRequestDto,
  ): Promise<BaseResponseDto<EmailOverviewDto>> {
    return BaseResponseDto.success(
      EmailOverviewDto.from(dto.period, await this.emails.overview(dto)),
    );
  }

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delivery settings of this environment' })
  @ApiOkResponse({ type: ApiResponse(EmailSettingsDto) })
  settings(): BaseResponseDto<EmailSettingsDto> {
    return BaseResponseDto.success({ ...this.emails.settings() });
  }

  @Get('counts')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Emails per status under the list filters, for the tabs',
  })
  @ApiOkResponse({ type: ApiResponseArray(EmailStatusCountDto) })
  async counts(
    @Query() dto: EmailFilterDto,
  ): Promise<BaseResponseDto<EmailStatusCountDto[]>> {
    return BaseResponseDto.success(
      EmailStatusCountDto.list(await this.emails.countByStatus(dto)),
    );
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'The email log, newest first by default' })
  @ApiOkResponse({ type: ApiResponse(EmailSearchResponseDto) })
  async search(
    @Query() dto: EmailSearchRequestDto,
  ): Promise<BaseResponseDto<EmailSearchResponseDto>> {
    const { items, totalItems, lookups } = await this.emails.search(dto);
    return BaseResponseDto.success(
      new EmailSearchResponseDto(
        items.map((message) => EmailMessageDto.from(message, lookups)),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Post('retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Send the selected emails, or all matching the filter, again; the ones not allowed are skipped',
  })
  @ApiOkResponse({ type: ApiResponse(EmailBulkResultDto) })
  async retryMany(
    @Body() dto: EmailBulkRequestDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<EmailBulkResultDto>> {
    return BaseResponseDto.success(
      await this.emails.retryMany(dto, payload.sub),
    );
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel the selected waiting or failed emails, or all matching the filter',
  })
  @ApiOkResponse({ type: ApiResponse(EmailBulkResultDto) })
  async cancelMany(
    @Body() dto: EmailBulkRequestDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<EmailBulkResultDto>> {
    return BaseResponseDto.success(
      await this.emails.cancelMany(dto, payload.sub),
    );
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Send a test email now, bypassing the queue; the SMTP answer comes back',
  })
  @ApiOkResponse({ type: ApiResponse(EmailTestResultDto) })
  async test(
    @Body() dto: EmailTestRequestDto,
  ): Promise<BaseResponseDto<EmailTestResultDto>> {
    return BaseResponseDto.success(
      EmailTestResultDto.from(await this.emails.testSmtp(dto)),
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'An email with its delivery history' })
  @ApiOkResponse({ type: ApiResponse(EmailMessageDetailsDto) })
  @ApiNotFoundResponse({ description: 'Email not found' })
  async details(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<EmailMessageDetailsDto>> {
    const { message, events, lookups } = await this.emails.details(id);
    return BaseResponseDto.success(
      EmailMessageDetailsDto.fromDetails(message, events, lookups),
    );
  }

  @Get(':id/preview')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'The email rendered now from its stored data, with current brand details',
  })
  @ApiOkResponse({ type: ApiResponse(EmailPreviewDto) })
  @ApiNotFoundResponse({ description: 'Email not found' })
  @ApiConflictResponse({ description: 'EMAIL_PREVIEW_UNAVAILABLE' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BaseResponseDto<EmailPreviewDto>> {
    return BaseResponseDto.success(await this.emails.preview(id));
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send the email again with a fresh set of attempts',
  })
  @ApiOkResponse({ type: ApiResponse(EmailMessageDto) })
  @ApiNotFoundResponse({ description: 'Email not found' })
  @ApiConflictResponse({
    description:
      'EMAIL_RETRY_UNAVAILABLE; responseValue.reason is EmailRetryBlock',
  })
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<EmailMessageDto>> {
    const { message, lookups } = await this.emails.retry(id, payload.sub);
    return BaseResponseDto.success(EmailMessageDto.from(message, lookups));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop a waiting or failed email from being sent' })
  @ApiOkResponse({ type: ApiResponse(EmailMessageDto) })
  @ApiNotFoundResponse({ description: 'Email not found' })
  @ApiConflictResponse({ description: 'EMAIL_CANCEL_UNAVAILABLE' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<EmailMessageDto>> {
    const { message, lookups } = await this.emails.cancel(id, payload.sub);
    return BaseResponseDto.success(EmailMessageDto.from(message, lookups));
  }
}
