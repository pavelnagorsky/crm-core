const dependency = (kind: string, id: string) =>
  `${kind}:${encodeURIComponent(id)}`;

export const CacheDependency = {
  brandLifecycle: (id: string) => dependency('brand.lifecycle', id),
  locationLifecycle: (id: string) => dependency('location.lifecycle', id),
  brandProfile: (id: string) => dependency('brand.profile', id),
  locationSettings: (id: string) => dependency('location.settings', id),
  serviceCatalog: (id: string) => dependency('services.catalog', id),
  staffDirectory: (id: string) => dependency('staff.directory', id),
  staffSchedule: (id: string) => dependency('staff.schedule', id),
  brandProducts: (id: string) => dependency('products.brand', id),
  locationProducts: (id: string) => dependency('products.location', id),
};
