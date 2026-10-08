export interface ResolvedBookingClient {
  id: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  bannedAt: Date | null;
}
