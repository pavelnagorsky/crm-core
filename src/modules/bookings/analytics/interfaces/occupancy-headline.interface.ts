import { OccupancyBookedHours } from '../../interfaces/occupancy-booked-hours.interface.js';

export interface OccupancyHeadline {
  booked: OccupancyBookedHours;
  capacityMinutes: number;
}
