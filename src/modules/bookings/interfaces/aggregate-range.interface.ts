export interface AggregateRange {
  businessId: string;
  from: Date;
  to: Date;
  staffId?: string;
  serviceId?: string;
  serviceIds?: string[];
  categoryId?: string;
}
