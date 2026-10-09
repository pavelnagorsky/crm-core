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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../shared/dto/base-response.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { LocationRBAC } from '../auth/decorators/location-rbac.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ConfirmOrderItemsDto } from './dto/confirm-order-items.dto.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { OrderSearchResponseDto } from './dto/order-search-response.dto.js';
import { OrderStatusCountResponseDto } from './dto/order-status-count-response.dto.js';
import { OrderStatusCountsRequestDto } from './dto/order-status-counts-request.dto.js';
import { ReverseOrderItemDto } from './dto/reverse-order-item.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('Orders')
@Controller('locations/:locationId/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiOperation({
    summary: 'Create an active product order, optionally confirmed immediately',
  })
  @ApiCreatedResponse({ type: ApiResponse(OrderResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateOrderDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.create(
      locationId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Search internal orders' })
  @ApiOkResponse({ type: ApiResponse(OrderSearchResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get()
  async search(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: OrderSearchRequestDto,
  ): Promise<BaseResponseDto<OrderSearchResponseDto>> {
    const { items, totalItems } = await this.orders.search(locationId, dto);
    return BaseResponseDto.success(
      new OrderSearchResponseDto(
        items.map(OrderResponseDto.fromEntity),
        dto.page,
        dto.pageSize,
        totalItems,
        dto.isExport,
      ),
    );
  }

  @ApiOperation({ summary: 'Get order count per status' })
  @ApiOkResponse({ type: ApiResponseArray(OrderStatusCountResponseDto) })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Get(':orderId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    return BaseResponseDto.success(
      OrderResponseDto.fromEntity(
        await this.orders.findById(locationId, orderId),
      ),
    );
  }

  @ApiOperation({ summary: 'Replace draft items in an active order' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiConflictResponse({ description: 'Order is immutable' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Put(':orderId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.update(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Void an internal order' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiConflictResponse({ description: 'Order status transition rejected' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Patch(':orderId/status')
  async changeStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.changeStatus(
      locationId,
      orderId,
      dto.status,
      dto.reason,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Confirm a draft order item' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiConflictResponse({ description: 'Order item cannot be confirmed' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Patch(':orderId/items/:orderItemId/confirm')
  async confirmItem(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('orderItemId', ParseUUIDPipe) orderItemId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.confirmItem(
      locationId,
      orderId,
      orderItemId,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Confirm multiple draft product order items' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiConflictResponse({ description: 'Order items cannot be confirmed' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Post(':orderId/items/confirm')
  async confirmItems(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ConfirmOrderItemsDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.confirmItems(
      locationId,
      orderId,
      dto,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Reverse a confirmed order item' })
  @ApiOkResponse({ type: ApiResponse(OrderResponseDto) })
  @ApiConflictResponse({ description: 'Order item cannot be reversed' })
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
  @Patch(':orderId/items/:orderItemId/reverse')
  async reverseItem(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('orderItemId', ParseUUIDPipe) orderItemId: string,
    @Body() dto: ReverseOrderItemDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<OrderResponseDto>> {
    const order = await this.orders.reverseItem(
      locationId,
      orderId,
      orderItemId,
      dto.reason,
      auditActorFromToken(token, locationId),
    );
    return BaseResponseDto.success(OrderResponseDto.fromEntity(order));
  }

  @ApiOperation({ summary: 'Delete an active draft order' })
  @ApiNoContentResponse()
  @LocationRBAC(BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.STAFF)
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
