/** What the caller may do when creating a manual booking, resolved from the token by the controller. */
export interface ManualBookingAccess {
  /** Create the visit as completed: order:write in the location. */
  canComplete: boolean;
  /** Set for booking.own:write without booking:write: the caller must perform a service. */
  ownStaffId?: string;
}
