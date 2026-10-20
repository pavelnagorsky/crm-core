export interface ProductSalesRange {
  locationIds: string[];
  from: Date;
  to: Date;
  staffId?: string;
  catalogItemId?: string;
  categoryId?: string;
}
