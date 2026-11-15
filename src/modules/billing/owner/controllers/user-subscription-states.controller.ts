import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { Auth } from '../../../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { SubscriptionStateItemDto } from '../../dto/subscription-state-item.dto.js';
import { TrialEligibilityResponseDto } from '../../dto/trial-eligibility-response.dto.js';
import { UserSubscriptionStatesService } from '../services/user-subscription-states.service.js';

@ApiTags('Subscription')
@Controller('users/me')
@Auth()
export class UserSubscriptionStatesController {
  constructor(private readonly userStates: UserSubscriptionStatesService) {}

  @Get('trial-eligibility')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Whether a new brand of the current user gets a free trial',
  })
  @ApiOkResponse({ type: ApiResponse(TrialEligibilityResponseDto) })
  async trialEligibility(
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<TrialEligibilityResponseDto>> {
    return BaseResponseDto.success(
      TrialEligibilityResponseDto.fromEntity(
        await this.userStates.trialEligibility(payload.sub),
      ),
    );
  }

  @Get('subscription-states')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Subscription state of every brand in the token, for banners and the block page; brands without a subscription are omitted',
  })
  @ApiOkResponse({ type: ApiResponseArray(SubscriptionStateItemDto) })
  async states(
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<SubscriptionStateItemDto[]>> {
    const items = await this.userStates.states(payload);
    return BaseResponseDto.success(
      items.map(SubscriptionStateItemDto.fromEntity),
    );
  }
}
