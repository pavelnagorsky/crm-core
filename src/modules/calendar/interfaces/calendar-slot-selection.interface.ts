import { CalendarSlotCandidate } from './calendar-slot-candidate.interface.js';
import { CalendarSlotItem } from './calendar-slot-item.interface.js';

/** What a slot request asks for: visit length, items in order and who can take each item. */
export interface CalendarSlotSelection {
  service: { durationMinutes: number; bufferMinutes: number };
  candidateStaff: CalendarSlotCandidate[];
  slotItems: CalendarSlotItem[];
  executionMode: string;
  candidatesByService: Map<string, CalendarSlotCandidate[]>;
}
