export interface BookingNotificationData {
  id: string;
  locationId: string;
  clientEmail: string;
  clientFirstName: string;
  clientLastName: string;
  serviceTitle: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
}
