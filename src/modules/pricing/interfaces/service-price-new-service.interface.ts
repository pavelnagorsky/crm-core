/** A service the file creates. */
export interface ServicePriceNewService {
  row: number;
  categoryName: string | null;
  categoryWillBeCreated: boolean;
  title: string;
  durationMinutes: number;
  price: string;
  description: string | null;
  /** Only the filled level columns. */
  levelPrices: { levelId: string; levelName: string; price: string }[];
}
