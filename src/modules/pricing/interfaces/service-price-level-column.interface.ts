/** A header of the sheet "Цены" that may be a price level column. */
export interface ServicePriceLevelColumn {
  index: number;
  /** The header as written in the file. */
  header: string;
  /** The level name: the part after "Цена: ", or the whole header. */
  name: string;
  /** True when the header starts with "Цена: ": then an unknown name is an error. */
  prefixed: boolean;
}
