import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AdminSubscriptionPaymentDto } from '../../dto/admin-subscription-payment.dto.js';
import { AdminSubscriptionPaymentsRequestDto } from '../../dto/admin-subscription-payments-request.dto.js';
import { AdminSubscriptionPaymentsResponseDto } from '../../dto/admin-subscription-payments-response.dto.js';
import { CancelSubscriptionPaymentDto } from '../../dto/cancel-subscription-payment.dto.js';
import { ConfirmSubscriptionPaymentDto } from '../../dto/confirm-subscription-payment.dto.js';
import { AdminSubscriptionPaymentsService } from '../services/admin-subscription-payments.service.js';

@ApiTags('Billing administration')
@Controller('admin/billing/payments')
@UseGuards(PlatformAdminGuard)
@Auth()
@ApiForbiddenResponse({
  description: 'Only platform administrators can manage billing',
})
export class AdminSubscriptionPaymentsController {
  constructor(private readonly payments: AdminSubscriptionPaymentsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Search payments; without a status filter only PENDING requests are returned',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionPaymentsResponseDto) })
  async search(
    @Query() dto: AdminSubscriptionPaymentsRequestDto,
  ): Promise<BaseResponseDto<AdminSubscriptionPaymentsResponseDto>> {
    const { items, totalItems, brandNames } = await this.payments.search(dto);
    return BaseResponseDto.success(
      new AdminSubscriptionPaymentsResponseDto(
        items.map((p) =>
          AdminSubscriptionPaymentDto.fromAdmin(
            p,
            brandNames.get(p.brandId) ?? null,
          ),
        ),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @Post(':id/confirm')
  @ApiOperation({
    summary:
      'Mark an OFFLINE request as paid for its requested amount and apply it; a repeated call changes nothing',
  })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionPaymentDto) })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  @ApiBadRequestResponse({ description: 'SUBSCRIPTION_PAYMENT_DATE_INVALID' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmSubscriptionPaymentDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionPaymentDto>> {
    const { payment, brandName } = await this.payments.confirm(
      id,
      dto,
      payload.sub,
    );
    return BaseResponseDto.success(
      AdminSubscriptionPaymentDto.fromAdmin(payment, brandName),
    );
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a PENDING request' })
  @ApiOkResponse({ type: ApiResponse(AdminSubscriptionPaymentDto) })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  @ApiConflictResponse({ description: 'SUBSCRIPTION_PAYMENT_NOT_CANCELABLE' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSubscriptionPaymentDto,
    @TokenPayload() payload: TokenPayloadDto,
  ): Promise<BaseResponseDto<AdminSubscriptionPaymentDto>> {
    const { payment, brandName } = await this.payments.cancel(
      id,
      dto,
      payload.sub,
    );
    return BaseResponseDto.success(
      AdminSubscriptionPaymentDto.fromAdmin(payment, brandName),
    );
  }
}
