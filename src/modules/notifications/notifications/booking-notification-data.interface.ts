export interface BookingNotificationData {
  id: string;
  clientEmail: string | null;
  clientFirstName: string;
  clientLastName: string;
  serviceTitle: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
}
