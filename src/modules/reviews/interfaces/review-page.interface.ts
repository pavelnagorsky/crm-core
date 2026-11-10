import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface ReviewPage {
  items: ReviewWithStaff[];
  totalItems: number;
}
