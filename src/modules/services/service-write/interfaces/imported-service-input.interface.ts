/** A service created from a price file. */
export interface ImportedServiceInput {
  title: string;
  description: string | null;
  price: string;
  durationMinutes: number;
  /** An existing or new category by name; null means no category. */
  categoryName: string | null;
}
