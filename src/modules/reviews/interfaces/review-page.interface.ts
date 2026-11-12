import { ReviewWithStaff } from './review-with-staff.interface.js';

export interface ReviewPage<T extends ReviewWithStaff = ReviewWithStaff> {
  items: T[];
  totalItems: number;
}
