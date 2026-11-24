/** A row of the "not returned" export. */
export interface PromotionNotReturnedRow {
  name: string;
  phone: string | null;
  email: string | null;
  /** Start of the last completed visit with the promotion. */
  visitAt: Date;
  staffNames: string[];
  serviceTitles: string[];
}
