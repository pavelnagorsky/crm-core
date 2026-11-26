/** A support request as its emails show it. */
export interface SupportRequestEmailData {
  requestId: string;
  /** Where support answers. */
  email: string;
  /** The signed-in author's name, else their account email or phone; null for guests. */
  userName: string | null;
  message: string;
  attachmentCount: number;
  adminLink: string;
}
