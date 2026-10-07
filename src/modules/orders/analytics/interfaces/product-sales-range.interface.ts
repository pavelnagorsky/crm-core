export interface ProductSalesRange {
  locationId: string;
  from: Date;
  to: Date;
  staffId?: string;
  catalogItemId?: string;
  categoryId?: string;
}
