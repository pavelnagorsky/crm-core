/** A demo request from the contacts page as its emails show it. */
export interface FeedbackEmailData {
  feedbackId: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  adminLink: string;
}
