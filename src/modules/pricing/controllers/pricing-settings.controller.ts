import { Body, Controller, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Write } from '../../access/utils/permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { PricingSettingsResponseDto } from '../dto/pricing-settings-response.dto.js';
import { UpdatePricingSettingsDto } from '../dto/update-pricing-settings.dto.js';

@ApiTags('Pricing')
@Controller('locations/:locationId/pricing')
export class PricingSettingsController {
  constructor(private readonly locations: LocationService) {}

  @ApiOperation({
    summary: 'Set the step the surcharged prices of the location round to',
  })
  @ApiOkResponse({ type: ApiResponse(PricingSettingsResponseDto) })
  @Permissions(Write(Claim.PRICING))
  @Put('settings')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdatePricingSettingsDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<PricingSettingsResponseDto>> {
    const location = await this.locations.updatePriceRoundingStep(
      locationId,
      dto.priceRoundingStep,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      PricingSettingsResponseDto.fromStep(location.priceRoundingStep),
    );
  }
}
