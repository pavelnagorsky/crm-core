import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
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
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { BookingWidgetsService } from './booking-widgets.service.js';
import { SaveBookingWidgetDto } from './dto/save-booking-widget.dto.js';
import { BookingWidgetResponseDto } from './dto/booking-widget-response.dto.js';
import { UpdateBookingChannelStatusDto } from './dto/update-booking-channel-status.dto.js';

@ApiTags('Booking widgets')
@Controller('businesses/:businessId/booking-widgets')
export class BookingWidgetsController {
  constructor(private readonly widgets: BookingWidgetsService) {}

  @ApiOperation({ summary: 'List booking widgets' })
  @ApiOkResponse({ type: ApiResponseArray(BookingWidgetResponseDto) })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get()
  async list(
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto[]>> {
    const widgets = await this.widgets.list(businessId);
    return BaseResponseDto.success(widgets.map(BookingWidgetResponseDto.fromEntity));
  }

  @ApiOperation({ summary: 'Create a booking widget. It starts as a draft.' })
  @ApiCreatedResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiConflictResponse({ description: 'Widget title already exists in this business' })
  @RBAC(BusinessRole.OWNER)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: SaveBookingWidgetDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.create(businessId, dto);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Get a booking widget' })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get(':widgetId')
  async findById(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.findInBusiness(businessId, widgetId);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Replace booking widget content. Status is unchanged.' })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @ApiConflictResponse({ description: 'Widget title already exists in this business' })
  @RBAC(BusinessRole.OWNER)
  @Put(':widgetId')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: SaveBookingWidgetDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.update(businessId, widgetId, dto);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Publish or unpublish a booking widget' })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @ApiConflictResponse({ description: 'Status is already set, booking is closed, or nothing is bookable' })
  @RBAC(BusinessRole.OWNER)
  @Patch(':widgetId/status')
  async updateStatus(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: UpdateBookingChannelStatusDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.changeStatus(businessId, widgetId, dto.status);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Delete a booking widget' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<void> {
    await this.widgets.delete(businessId, widgetId);
  }
}
