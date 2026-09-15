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
import { GetCalendarRequestDto } from './dto/get-calendar-request.dto.js';
import { GetCalendarResponseDto } from './dto/get-calendar-response.dto.js';

@ApiTags('Calendar')
@Controller('businesses/:businessId/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @ApiOperation({ summary: 'Get calendar view for a date range. Expands recurring events, computes closed-time blocks and view bounds in business timezone.' })
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

  @ApiOperation({ summary: 'Create calendar event(s). Pass staffIds to create one per staff member; omit for a business-wide event.' })
  @ApiCreatedResponse({ type: ApiResponseArray(CalendarEventResponseDto) })
  @RBAC(BusinessRole.OWNER)
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto[]>> {
    const events = await this.calendarService.create(businessId, dto);
    return BaseResponseDto.success(events.map(CalendarEventResponseDto.fromEntity));
  }

  @ApiOperation({ summary: 'Update a calendar event. Use thisOnly=true to update only a single occurrence of a repeating event.' })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Put(':eventId')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    const event = await this.calendarService.update(eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({ summary: 'Delete a calendar event. Use thisOnly=true to cancel only a single occurrence of a repeating event.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @RBAC(BusinessRole.OWNER)
  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query() dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.calendarService.delete(eventId, dto);
  }
}
