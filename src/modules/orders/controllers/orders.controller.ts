import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, Write } from '../../access/utils/permission.js';
import { ApiResponseArray } from '../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { auditActorFromToken } from '../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { AddOrderItemsDto } from '../dto/add-order-items.dto.js';
import { ConfirmOrderItemsDto } from '../dto/confirm-order-items.dto.js';
import { CreateOrderReturnDto } from '../dto/create-order-return.dto.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrderPaymentResponseDto } from '../dto/order-payment-response.dto.js';
import { OrderResponseDto } from '../dto/order-response.dto.js';
import { OrderSearchRequestDto } from '../dto/order-search-request.dto.js';
import { OrderSearchResponseDto } from '../dto/order-search-response.dto.js';
import { OrderStatusCountResponseDto } from '../dto/order-status-count-response.dto.js';
import { OrderStatusCountsRequestDto } from '../dto/order-status-counts-request.dto.js';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto.js';
import { UpdateOrderDto } from '../dto/update-order.dto.js';
import { PaymentInputDto } from '../../payments/dto/payment-input.dto.js';
import { RefundInputDto } from '../../payments/dto/refund-input.dto.js';
import { VoidPaymentOperationDto } from '../../payments/dto/void-payment-operation.dto.js';
import { OrderPaymentsFacade } from '../order-payments.facade.js';
import { OrdersFacade } from '../orders.facade.js';

@ApiTags('Orders')
@Controller('locations/:locationId/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersFacade,
    private readonly orderPayments: OrderPaymentsFacade,
  ) {}

  @ApiOperation({
    summary: 'Create an active product order, optionally confirmed immediately',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({
    description:
      'ORDER_IDEMPOTENCY_CONFLICT: the sale key has a different or unknown original request. responseValue.orderId identifies the existing order. With payment: PAYMENT_TRACKING_DISABLED (nothing is created) and the errors of PUT orders/:orderId/payment.',
  })
  @Permissions(Write(Claim.ORDER))
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateOrderDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.create(
      locationId,
      dto,
      auditActorFromToken(token, locationId),
      hasPermission(token, Write(Claim.SALE_PRICE_OVERRIDE), locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Search internal orders' })
  @ApiOkResponse({ type: ApiResponse(OrderSearchResponseDto) })
  @Permissions(Read(Claim.ORDER))
  @Get()
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: OrderSearchRequestDto,
  ): Promise<BaseResponseDto<OrderSearchResponseDto>> {
    const { items, totalItems } = await this.orders.search(locationId, dto);
    const [payments, tracked] = await Promise.all([
      this.orderPayments.paymentTotals(items),
      this.orderPayments.paymentTrackedByOrder(locationId, items),
    ]);
    return BaseResponseDto.success(
      new OrderSearchResponseDto(
        items.map((order) =>
          OrderResponseDto.fromEntity(
            order,
            payments.get(order.id),
            tracked.get(order.id)!,
          ),
        ),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get order count per status' })
  @ApiOkResponse({ type: ApiResponseArray(OrderStatusCountResponseDto) })
  @Permissions(Read(Claim.ORDER))
  @Get('status-counts')
  async getStatusCounts(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: OrderStatusCountsRequestDto,
  ): Promise<BaseResponseDto<OrderStatusCountResponseDto[]>> {
    const counts = await this.orders.getStatusCounts(locationId, dto);
    return BaseResponseDto.success(
      counts.map((row) =>
        Object.assign(new OrderStatusCountResponseDto(), row),
      ),
    );
  }

  @ApiOperation({ summary: 'Get an internal order' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @Permissions(Read(Claim.ORDER))
  @Get(':orderId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.findById(locationId, orderId);
    const [payments, tracked] = await Promise.all([
      this.orderPayments.paymentTotals([order]),
      this.orderPayments.paymentTrackedByOrder(locationId, [order]),
    ]);
    return BaseResponseDto.success(
      OrderResponseDto.fromEntity(
        order,
        payments.get(order.id),
        tracked.get(order.id)!,
      ),
    );
  }

  @ApiOperation({ summary: 'Replace draft items in an active order' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Order is immutable' })
  @Permissions(Write(Claim.ORDER))
  @Put(':orderId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.update(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
      hasPermission(token, Write(Claim.SALE_PRICE_OVERRIDE), locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Void an internal order' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({
    description:
      'Order status transition rejected. ORDER_HAS_PAYMENTS: the paid amount is above 0; void the payment (a mistake) or refund the money first',
  })
  @Permissions(Write(Claim.ORDER_VOID))
  @Patch(':orderId/status')
  async changeStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.changeStatus(
      locationId,
      orderId,
      dto.status,
      dto.reason,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Add draft product items to an active order' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({ description: 'Product cannot be added' })
  @Permissions(Write(Claim.ORDER))
  @Post(':orderId/items')
  async addItems(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AddOrderItemsDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.addDraftItems(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
      hasPermission(token, Write(Claim.SALE_PRICE_OVERRIDE), locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({ summary: 'Confirm multiple draft product order items' })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiConflictResponse({
    description:
      'Order items cannot be confirmed. With payment: PAYMENT_TRACKING_DISABLED (nothing is confirmed) and the errors of PUT orders/:orderId/payment',
  })
  @Permissions(Write(Claim.ORDER))
  @Post(':orderId/items/confirm')
  async confirmItems(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ConfirmOrderItemsDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.confirmItems(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({
    summary: 'Create a product return for an active order',
    description:
      'Money paid beyond the amount due after the return goes back in the same transaction (at most the return total), dated like the return, by refund.method. A paid order stays PAID; an underpaid one may keep what it got. The visit of a visit order is locked first.',
  })
  @ApiCreatedResponse({ type: ApiResponse(IdResponseDto) })
  @ApiBadRequestResponse({
    description:
      'ORDER_RETURN_REFUND_REQUIRED: money goes back with this return and refund is missing. PAYMENT_DATE_INVALID: the return date is outside the payment date bounds',
  })
  @ApiConflictResponse({
    description:
      'Order item cannot be returned. PAYMENT_REFUND_EXCEEDS_PAID: the refund method was paid less; responseValue { paidAmount, method }',
  })
  @Permissions(Write(Claim.ORDER_RETURN))
  @Post(':orderId/returns')
  async createReturn(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateOrderReturnDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    const order = await this.orders.createReturn(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: order.id });
  }

  @ApiOperation({
    summary: 'Record or change the payment of a product sale',
    description:
      'Records how the client paid the whole amount due (the sale total), or replaces the active payment: the old records are voided and the new ones keep the old date unless occurredAt is set. MIXED parts must add up to the amount due plus active refunds.',
  })
  @ApiOkResponse({ type: ApiResponse(OrderPaymentResponseDto) })
  @ApiBadRequestResponse({
    description: 'PAYMENT_SPLIT_INVALID, PAYMENT_DATE_INVALID',
  })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiConflictResponse({
    description:
      'ORDER_PAYMENT_VIA_BOOKING: a visit order is paid through PUT bookings/:id/payment. PAYMENT_TRACKING_DISABLED: the location does not track payments. PAYMENT_ALREADY_RECORDED (expectNoPayment): responseValue { operationId }. PAYMENT_AMOUNT_MISMATCH (parts or expectedAmount): responseValue { amountDue, requiredAmount }. PAYMENT_NOTHING_DUE. PAYMENT_IDEMPOTENCY_CONFLICT: responseValue { operationId }. ORDER_NOT_ACTIVE',
  })
  @Permissions(Write(Claim.ORDER))
  @Put(':orderId/payment')
  async recordPayment(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PaymentInputDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderPaymentResponseDto>> {
    const operationId = await this.orderPayments.recordPayment(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: orderId, operationId });
  }

  @ApiOperation({
    summary: 'Refund money of an order',
    description:
      'A new money movement on its own date (default now); the day of the original payment does not change. Works for sales and visit orders.',
  })
  @ApiCreatedResponse({ type: ApiResponse(OrderPaymentResponseDto) })
  @ApiBadRequestResponse({ description: 'PAYMENT_DATE_INVALID' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  @ApiConflictResponse({
    description:
      'PAYMENT_REFUND_EXCEEDS_PAID: the amount is above what this method brought in net of its refunds (and the paid amount); responseValue { paidAmount, method }. PAYMENT_IDEMPOTENCY_CONFLICT: responseValue { operationId }',
  })
  @Permissions(Write(Claim.ORDER))
  @Post(':orderId/refunds')
  async refund(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: RefundInputDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderPaymentResponseDto>> {
    const operationId = await this.orderPayments.refund(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: orderId, operationId });
  }

  @ApiOperation({
    summary: 'Void a payment operation recorded by mistake',
    description:
      'Voids every active record of the payment or refund. Voiding it again changes nothing.',
  })
  @ApiOkResponse({ type: ApiResponse(IdResponseDto) })
  @ApiNotFoundResponse({
    description: 'PAYMENT_OPERATION_NOT_FOUND: no such operation in the order',
  })
  @ApiConflictResponse({
    description:
      'PAYMENT_OPERATION_LINKED_TO_RETURN: a refund made with a product return. PAYMENT_VOID_HAS_REFUNDS: a payment while active refunds exist; change the payment instead. BOOKING_PAYMENT_NOT_ALLOWED: a refund of a deleted visit (voiding it would bring money back on record)',
  })
  @Permissions(Write(Claim.ORDER))
  @Post(':orderId/payment-operations/:operationId/void')
  @HttpCode(HttpStatus.OK)
  async voidPaymentOperation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() dto: VoidPaymentOperationDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<IdResponseDto>> {
    await this.orderPayments.voidPaymentOperation(
      locationId,
      orderId,
      operationId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success({ id: orderId });
  }

  @ApiOperation({ summary: 'Delete an active draft order' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description:
      'ORDER_HAS_PAYMENTS: the payment journal has records of the order, voided ones included',
  })
  @Permissions(Write(Claim.ORDER))
  @Delete(':orderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<void> {
    await this.orders.delete(
      locationId,
      orderId,
      auditActorFromToken(token, locationId),
    );
  }
}
