export interface AggregateRange {
  locationId: string;
  from: Date;
  to: Date;
  staffId?: string;
  catalogItemId?: string;
  serviceIds?: string[];
  categoryId?: string;
}
