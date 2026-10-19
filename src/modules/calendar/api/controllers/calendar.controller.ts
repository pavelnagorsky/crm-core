import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Claim } from '../../../access/enums/claim.enum.js';
import { Read, Write } from '../../../access/utils/permission.js';
import { ApiResponseArray } from '../../../../shared/dto/api-response-array.dto.js';
import { ApiResponse } from '../../../../shared/dto/api-response.dto.js';
import { BaseResponseDto } from '../../../../shared/dto/base-response.dto.js';
import { auditActorFromToken } from '../../../audit/utils/audit-actor-from-token.js';
import { Permissions } from '../../../auth/decorators/permissions.decorator.js';
import { TokenPayload } from '../../../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { BookingAccessService } from '../../../bookings/services/booking-access.service.js';
import { CalendarFacade } from '../../calendar.facade.js';
import { AvailableSlotsDayDto } from '../../dto/available-slots-day.dto.js';
import { AvailableSlotsRequestDto } from '../../dto/available-slots-request.dto.js';
import { CalendarEventResponseDto } from '../../dto/calendar-event-response.dto.js';
import { CreateCalendarEventDto } from '../../dto/create-calendar-event.dto.js';
import { DeleteCalendarEventDto } from '../../dto/delete-calendar-event.dto.js';
import { GetCalendarRequestDto } from '../../dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from '../../dto/get-calendar-response.dto.js';
import { ManualAvailableSlotsRequestDto } from '../../dto/manual-available-slots-request.dto.js';
import { MoveCalendarEventDto } from '../../dto/move-calendar-event.dto.js';
import { UpdateCalendarEventDto } from '../../dto/update-calendar-event.dto.js';
import { CalendarViewFacade } from '../calendar-view.facade.js';

@ApiTags('Calendar')
@Controller('locations/:locationId/calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarFacade,
    private readonly calendarView: CalendarViewFacade,
    private readonly access: BookingAccessService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Get available booking slots for a service within the business advance-booking window (public).',
  })
  @ApiOkResponse({ type: ApiResponseArray(AvailableSlotsDayDto) })
  @ApiNotFoundResponse({ description: 'Location or service not found' })
  @Get('public/available-slots')
  async getAvailableSlots(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: AvailableSlotsRequestDto,
  ): Promise<BaseResponseDto<AvailableSlotsDayDto[]>> {
    const days = await this.calendar.getAvailableSlots(locationId, dto);
    return BaseResponseDto.success(days);
  }

  @ApiOperation({
    summary:
      'Get available slots for manual booking (owner / staff). Same free-time rules as the public list, without online-booking visibility, minimum notice, or the advance window.',
  })
  @ApiOkResponse({ type: ApiResponseArray(AvailableSlotsDayDto) })
  @ApiNotFoundResponse({ description: 'Location or service not found' })
  @ApiBadRequestResponse({ description: 'Date range is longer than 62 days' })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get('available-slots')
  async getManualAvailableSlots(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: ManualAvailableSlotsRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<AvailableSlotsDayDto[]>> {
    const days = await this.calendarView.getManualAvailableSlots(
      locationId,
      dto,
      await this.access.readStaffId(token, locationId),
    );
    return BaseResponseDto.success(days);
  }

  // ─── Owner ───────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      'Get calendar view for a date range. Blocks, bookings, and closed time in the business timezone. Recurring blocks are expanded onto each occurrence.',
  })
  @ApiOkResponse({ type: ApiResponse(GetCalendarResponseDto) })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get()
  async getCalendar(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() dto: GetCalendarRequestDto,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<GetCalendarResponseDto>> {
    const staffId = await this.access.readStaffId(token, locationId);
    const result = await this.calendarView.getCalendar(
      locationId,
      staffId ? { ...dto, staffIds: [staffId] } : dto,
    );
    return BaseResponseDto.success(result);
  }

  @ApiOperation({
    summary:
      'Get one block series for the editor. eventId is the series id, not an occurrence.',
  })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Permissions([Read(Claim.BOOKING), Read(Claim.BOOKING_OWN)])
  @Get(':eventId')
  async getEvent(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @TokenPayload() token: TokenPayloadDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const staffId = await this.access.readStaffId(token, locationId);
    const event = await this.calendar.findInLocation(locationId, eventId);
    if (staffId && event.staffId !== null && event.staffId !== staffId)
      throw new ForbiddenException('Access denied');
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({
    summary:
      'Create a block. Pass staffIds to create one per staff member; omit for a business-wide block.',
  })
  @ApiCreatedResponse({ type: ApiResponseArray(CalendarEventResponseDto) })
  @Permissions(Write(Claim.CALENDAR_BLOCKS))
  @Post()
  async create(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: CreateCalendarEventDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto[]>> {
    const events = await this.calendar.create(
      locationId,
      dto,
      auditActorFromToken(tokenPayload, locationId),
    );
    return BaseResponseDto.success(
      events.map(CalendarEventResponseDto.fromEntity),
    );
  }

  @ApiOperation({
    summary:
      'Move a block on the grid. Only the interval changes; title, notes, reason, and repeat stay as stored.',
  })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Permissions(Write(Claim.CALENDAR_BLOCKS))
  @Put(':eventId/occurrence')
  async moveOccurrence(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: MoveCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendar.moveOccurrence(locationId, eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({
    summary:
      'Update a block. Use thisOnly=true to update only a single occurrence of a repeating block.',
  })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Permissions(Write(Claim.CALENDAR_BLOCKS))
  @Put(':eventId')
  async update(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendar.update(locationId, eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({
    summary:
      'Delete a block. Use thisOnly=true to cancel only a single occurrence of a repeating block.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Permissions(Write(Claim.CALENDAR_BLOCKS))
  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.calendar.delete(locationId, eventId, dto);
  }
}
