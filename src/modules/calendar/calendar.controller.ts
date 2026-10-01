import {
  Body,
  Controller,
  Delete,
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
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { RBAC } from '../business/decorators/rbac.decorator.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { CalendarService } from './calendar.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { CalendarEventResponseDto } from './dto/calendar-event-response.dto.js';
import { MoveCalendarEventDto } from './dto/move-calendar-event.dto.js';
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';
import { AvailableSlotsRequestDto } from './dto/available-slots-request.dto.js';
import { AvailableSlotsDayDto } from './dto/available-slots-day.dto.js';
import { ManualAvailableSlotsRequestDto } from './dto/manual-available-slots-request.dto.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';

@ApiTags('Calendar')
@Controller('businesses/:businessId/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  // ─── Public ──────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get available booking slots for a service within the business advance-booking window (public).' })
  @ApiOkResponse({ type: ApiResponseArray(AvailableSlotsDayDto) })
  @ApiNotFoundResponse({ description: 'Business or service not found' })
  @Get('public/available-slots')
  async getAvailableSlots(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: AvailableSlotsRequestDto,
  ): Promise<BaseResponseDto<AvailableSlotsDayDto[]>> {
    const days = await this.calendarService.getAvailableSlots(businessId, dto);
    return BaseResponseDto.success(days);
  }

  @ApiOperation({
    summary: 'Get available slots for manual booking (owner / staff). Same free-time rules as the public list, without online-booking visibility, minimum notice, or the advance window.',
  })
  @ApiOkResponse({ type: ApiResponseArray(AvailableSlotsDayDto) })
  @ApiNotFoundResponse({ description: 'Business or service not found' })
  @ApiBadRequestResponse({ description: 'Date range is longer than 62 days' })
  @RBAC(BusinessRole.OWNER, BusinessRole.STAFF)
  @Get('available-slots')
  async getManualAvailableSlots(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: ManualAvailableSlotsRequestDto,
  ): Promise<BaseResponseDto<AvailableSlotsDayDto[]>> {
    const days = await this.calendarService.getManualAvailableSlots(businessId, dto);
    return BaseResponseDto.success(days);
  }

  // ─── Owner ───────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Get calendar view for a date range. Blocks, bookings, and closed time in the business timezone. Recurring blocks are expanded onto each occurrence.' })
  @ApiOkResponse({ type: ApiResponse(GetCalendarResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Get()
  async getCalendar(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() dto: GetCalendarRequestDto,
  ): Promise<BaseResponseDto<GetCalendarResponseDto>> {
    const result = await this.calendarService.getCalendar(businessId, dto);
    return BaseResponseDto.success(result);
  }

  @ApiOperation({ summary: 'Get one block series for the editor. eventId is the series id, not an occurrence.' })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Get(':eventId')
  async getEvent(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendarService.findInBusiness(businessId, eventId);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({ summary: 'Create a block. Pass staffIds to create one per staff member; omit for a business-wide block.' })
  @ApiCreatedResponse({ type: ApiResponseArray(CalendarEventResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateCalendarEventDto,
    @TokenPayload() tokenPayload: TokenPayloadDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto[]>> {
    const events = await this.calendarService.create(
      businessId,
      dto,
      auditActorFromToken(tokenPayload, businessId),
    );
    return BaseResponseDto.success(events.map(CalendarEventResponseDto.fromEntity));
  }

  @ApiOperation({ summary: 'Move a block on the grid. Only the interval changes; title, notes, reason, and repeat stay as stored.' })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':eventId/occurrence')
  async moveOccurrence(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: MoveCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendarService.moveOccurrence(businessId, eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({ summary: 'Update a block. Use thisOnly=true to update only a single occurrence of a repeating block.' })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':eventId')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendarService.update(businessId, eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({ summary: 'Delete a block. Use thisOnly=true to cancel only a single occurrence of a repeating block.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.calendarService.delete(businessId, eventId, dto);
  }
}
