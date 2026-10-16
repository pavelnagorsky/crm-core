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
import {
  ApiResponse,
  ApiResponseArray,
  BaseResponseDto,
} from '../../../shared/dto/base-response.dto.js';
import { BookingWidgetsService } from '../services/booking-widgets.service.js';
import { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import { BookingWidgetResponseDto } from '../dto/booking-widget-response.dto.js';
import { UpdateBookingChannelStatusDto } from '../dto/update-booking-channel-status.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { Permissions } from '../../auth/decorators/permissions.decorator.js';

@ApiTags('Booking widgets')
@Controller('locations/:locationId/booking-widgets')
export class BookingWidgetsController {
  constructor(private readonly widgets: BookingWidgetsService) {}

  @ApiOperation({ summary: 'List booking widgets' })
  @ApiOkResponse({ type: ApiResponseArray(BookingWidgetResponseDto) })
  @Permissions(Permission.BOOKING_CHANNEL_READ)
  @Get()
  async list(
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto[]>> {
    const widgets = await this.widgets.list(locationId);
    return BaseResponseDto.success(
      widgets.map(BookingWidgetResponseDto.fromEntity),
    );
  }

  @ApiOperation({ summary: 'Create a booking widget. It starts as a draft.' })
  @ApiCreatedResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiConflictResponse({
    description: 'Widget title already exists in this business',
  })
  @Permissions(Permission.BOOKING_CHANNEL_MANAGE)
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: SaveBookingWidgetDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.create(locationId, dto);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Get a booking widget' })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @Permissions(Permission.BOOKING_CHANNEL_READ)
  @Get(':widgetId')
  async findById(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.findInLocation(locationId, widgetId);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({
    summary: 'Replace booking widget content. Status is unchanged.',
  })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @ApiConflictResponse({
    description: 'Widget title already exists in this business',
  })
  @Permissions(Permission.BOOKING_CHANNEL_MANAGE)
  @Put(':widgetId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: SaveBookingWidgetDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.update(locationId, widgetId, dto);
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Publish or unpublish a booking widget' })
  @ApiOkResponse({ type: ApiResponse(BookingWidgetResponseDto) })
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @ApiConflictResponse({
    description:
      'Status is already set, booking is closed, or nothing is bookable',
  })
  @Permissions(Permission.BOOKING_CHANNEL_MANAGE)
  @Patch(':widgetId/status')
  async updateStatus(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: UpdateBookingChannelStatusDto,
  ): Promise<BaseResponseDto<BookingWidgetResponseDto>> {
    const widget = await this.widgets.changeStatus(
      locationId,
      widgetId,
      dto.status,
    );
    return BaseResponseDto.success(BookingWidgetResponseDto.fromEntity(widget));
  }

  @ApiOperation({ summary: 'Delete a booking widget' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Booking widget not found' })
  @Permissions(Permission.BOOKING_CHANNEL_MANAGE)
  @Delete(':widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<void> {
    await this.widgets.delete(locationId, widgetId);
  }
}
