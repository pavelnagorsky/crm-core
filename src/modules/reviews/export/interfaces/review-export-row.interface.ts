export interface ReviewExportRow extends Record<string, unknown> {
  reviewedAt: string;
  rating: number;
  text: string;
  authorFirstName: string;
  authorLastName: string;
  staffNames: string;
  visitStartAt: string;
  visitServices: string;
  status: string;
  hiddenReason: string;
  replyText: string;
  repliedAt: string;
  repliedByName: string;
  source: string;
}
