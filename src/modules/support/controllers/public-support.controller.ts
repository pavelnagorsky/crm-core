import { Body, Controller, Header, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator.js';
import { OptionalTokenPayload } from '../../auth/decorators/optional-token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { CreateSupportRequestDto } from '../dto/create-support-request.dto.js';
import { SupportService } from '../services/support.service.js';

@ApiTags('Support')
@Controller('public/support-requests')
export class PublicSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @OptionalAuth()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Submit a support request as a guest or signed-in user; guests must provide an email and cannot attach files',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiBadRequestResponse({
    description:
      'Invalid form, missing reply email (SUPPORT_EMAIL_REQUIRED) or guest attachments (SUPPORT_ATTACHMENTS_REQUIRE_AUTH)',
  })
  @ApiNotFoundResponse({
    description: 'An attached file does not exist or belongs to someone else',
  })
  async create(
    @Body() dto: CreateSupportRequestDto,
    @OptionalTokenPayload() payload: TokenPayloadDto | null,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const request = await this.supportService.create(dto, payload?.sub ?? null);
    return BaseResponseDto.success({ id: request.id });
  }
}
