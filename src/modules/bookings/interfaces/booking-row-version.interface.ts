import { ClientNoticeState } from './client-notice-state.interface.js';

export interface BookingRowVersion extends ClientNoticeState {
  status: string;
  updatedAt: Date;
}
