/** Items in order with their price layers (the layers in their stored order). */
export const bookingWithItemsInclude = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: { priceAdjustments: { orderBy: { sortOrder: 'asc' as const } } },
  },
};
