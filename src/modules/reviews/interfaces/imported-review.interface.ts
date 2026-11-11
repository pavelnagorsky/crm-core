export interface ImportedReview {
  /** Unique per location: re-importing the same row is a no-op. */
  importKey: string;
  rating: number;
  text: string;
  authorFirstName: string | null;
  authorLastName: string | null;
  reviewedAt: Date;
  source: string | null;
  replyText: string | null;
  staff: readonly { staffId: string; staffName: string }[];
}
