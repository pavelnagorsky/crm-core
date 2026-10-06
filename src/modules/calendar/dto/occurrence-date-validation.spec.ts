import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalendarEventRepeatType } from '@prisma/client';
import { DeleteCalendarEventDto } from './delete-calendar-event.dto.js';
import { MoveCalendarEventDto } from './move-calendar-event.dto.js';
import { UpdateCalendarEventDto } from './update-calendar-event.dto.js';

async function fields(dto: object) {
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

function seriesUpdate(thisOnly: unknown, occurrenceDate?: unknown) {
  return plainToInstance(UpdateCalendarEventDto, {
    thisOnly,
    startDateTime: '2026-10-01T09:00:00',
    endDateTime: '2026-10-01T18:00:00',
    repeatType: CalendarEventRepeatType.WEEKLY,
    ...(occurrenceDate !== undefined ? { occurrenceDate } : {}),
  });
}

describe('calendar series occurrenceDate', () => {
  it('does not require a date when deleting the whole series', async () => {
    const omitted = plainToInstance(DeleteCalendarEventDto, {
      thisOnly: 'false',
    });
    const empty = plainToInstance(DeleteCalendarEventDto, {
      thisOnly: 'false',
      occurrenceDate: '',
    });

    expect(omitted.thisOnly).toBe(false);
    expect(await fields(omitted)).toEqual([]);
    expect(await fields(empty)).toEqual([]);
  });

  it('requires a date when deleting a single occurrence', async () => {
    const dto = plainToInstance(DeleteCalendarEventDto, { thisOnly: 'true' });

    expect(dto.thisOnly).toBe(true);
    expect(await fields(dto)).toEqual(['occurrenceDate']);
  });

  it('does not require a date when updating the whole series', async () => {
    expect(await fields(seriesUpdate(false))).toEqual([]);
    expect(await fields(seriesUpdate('false', null))).toEqual([]);
    expect(await fields(seriesUpdate('false', ''))).toEqual([]);
  });

  it('requires a date when updating a single occurrence', async () => {
    expect(await fields(seriesUpdate(true))).toEqual(['occurrenceDate']);
  });

  it('requires a date only when moving a single occurrence', async () => {
    const wholeSeries = plainToInstance(MoveCalendarEventDto, {
      thisOnly: false,
      startDateTime: '2026-10-01T10:00:00',
      endDateTime: '2026-10-01T11:00:00',
    });
    const oneOccurrence = plainToInstance(MoveCalendarEventDto, {
      thisOnly: true,
      startDateTime: '2026-10-01T10:00:00',
      endDateTime: '2026-10-01T11:00:00',
    });

    expect(await fields(wholeSeries)).toEqual([]);
    expect(await fields(oneOccurrence)).toEqual(['occurrenceDate']);
  });
});
