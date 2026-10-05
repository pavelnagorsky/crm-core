import { ServiceCatalogBundleItem } from './service-catalog-bundle-item.interface.js';
import { ServiceCatalogServiceItem } from './service-catalog-service-item.interface.js';

export type ServiceCatalogItem = ServiceCatalogServiceItem | ServiceCatalogBundleItem;
