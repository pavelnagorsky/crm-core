import { Body, Controller, Get, Header, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
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
import { BillingSettingsResponseDto } from '../../dto/billing-settings-response.dto.js';
import { UpdateBillingSettingsDto } from '../../dto/update-billing-settings.dto.js';
import { PaymentProviderRegistry } from '../../payments/payment-provider.registry.js';
import { BillingSettingsService } from '../../settings/services/billing-settings.service.js';

@ApiTags('Billing administration')
@Controller('admin/billing/settings')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage billing',
})
export class AdminBillingSettingsController {
  constructor(
    private readonly settings: BillingSettingsService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Billing settings and available payment providers' })
  @ApiOkResponse({ type: ApiResponse(BillingSettingsResponseDto) })
  async findSettings(): Promise<BaseResponseDto<BillingSettingsResponseDto>> {
    const settings = await this.settings.get();
    return BaseResponseDto.success(
      BillingSettingsResponseDto.fromEntity(settings, this.providers.list()),
    );
  }

  @Put()
  @ApiOperation({
    summary:
      'Update billing settings; launchedAt is set only by the launch script',
  })
  @ApiOkResponse({ type: ApiResponse(BillingSettingsResponseDto) })
  @ApiBadRequestResponse({ description: 'BILLING_PROVIDER_NOT_AVAILABLE' })
  async updateSettings(
    @Body() dto: UpdateBillingSettingsDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<BillingSettingsResponseDto>> {
    const settings = await this.settings.update(dto, payload.sub);
    return BaseResponseDto.success(
      BillingSettingsResponseDto.fromEntity(settings, this.providers.list()),
    );
  }
}
