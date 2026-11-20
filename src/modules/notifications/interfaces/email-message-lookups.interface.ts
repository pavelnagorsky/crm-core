/** What the admin DTOs need besides the log rows. */
export interface EmailMessageLookups {
  brandNames: Map<string, string>;
  locationNames: Map<string, string>;
  /** Admin names of retry and cancel actions. */
  actorNames: Map<string, string>;
  clientNotificationsEnabled: boolean;
  now: Date;
}
