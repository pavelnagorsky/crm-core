import { ServicePriceImportItemType } from '../enums/service-price-import-item-type.enum.js';

/** What the file is checked against: the catalog, levels and staff of the location. */
export interface ServicePriceImportCatalog {
  /** Services and bundles by id; a bundle that is not FIXED is marked. */
  items: ReadonlyMap<
    string,
    { type: ServicePriceImportItemType; fixed: boolean }
  >;
  /** Normalized "category|title" keys of the existing services. */
  serviceKeys: ReadonlySet<string>;
  /** Existing category names by normalized name. */
  categories: ReadonlyMap<string, string>;
  /** Price levels, the default one included. */
  levels: readonly { id: string; name: string; isDefault: boolean }[];
  /** Ids of the active staff of the location. */
  staffIds: ReadonlySet<string>;
  /** "staffId:serviceId" of every assignment of an active staff member. */
  assignments: ReadonlySet<string>;
}
