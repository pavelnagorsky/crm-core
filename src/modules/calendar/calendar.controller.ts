import {
  Body,
  Controller,
  Delete,
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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { TokenPayload } from '../auth/decorators/token-payload.decorator.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { ApiResponse, ApiResponseArray, BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { BusinessService } from '../business/business.service.js';
import { CalendarService } from './calendar.service.js';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';
import { DeleteCalendarEventDto } from './dto/delete-calendar-event.dto.js';
import { CalendarEventResponseDto } from './dto/calendar-event-response.dto.js';

@ApiTags('Calendar')
@Controller('businesses/:businessId/calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly businessService: BusinessService,
  ) {}

  @ApiOperation({ summary: 'Create calendar event(s). Pass staffIds to create one per staff member; omit for a business-wide event.' })
  @ApiCreatedResponse({ type: ApiResponseArray(CalendarEventResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @Auth()
  @Post()
  async create(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: CreateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto[]>> {
    await this.businessService.assertOwner(businessId, payload);
    const events = await this.calendarService.create(businessId, dto);
    return BaseResponseDto.success(events.map(CalendarEventResponseDto.fromEntity));
  }

  @ApiOperation({ summary: 'Update a calendar event. Use scope=THIS to update only a single occurrence of a repeating event.' })
  @ApiOkResponse({ type: ApiResponse(CalendarEventResponseDto) })
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Auth()
  @Put(':eventId')
  async update(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<BaseResponseDto<CalendarEventResponseDto>> {
    await this.businessService.assertOwner(businessId, payload);
    const event = await this.calendarService.update(eventId, dto);
    return BaseResponseDto.success(CalendarEventResponseDto.fromEntity(event));
  }

  @ApiOperation({ summary: 'Delete a calendar event. Use scope=THIS to cancel only a single occurrence of a repeating event.' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the owner' })
  @ApiNotFoundResponse({ description: 'Calendar event not found' })
  @Auth()
  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @TokenPayload() payload: TokenPayloadDto,
    @Query() dto: DeleteCalendarEventDto,
  ): Promise<void> {
    await this.businessService.assertOwner(businessId, payload);
    await this.calendarService.delete(eventId, dto);
  }
}
