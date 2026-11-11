/** A valid review row before staff names are matched. */
export interface ReviewSheetRecord {
  importKey: string;
  rating: number;
  text: string;
  authorFirstName: string | null;
  authorLastName: string | null;
  reviewedAt: Date;
  source: string | null;
  replyText: string | null;
  staffNames: string[];
}
