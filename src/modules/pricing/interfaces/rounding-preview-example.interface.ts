/** One row of the rounding preview, minor units. */
export interface RoundingPreviewExample {
  serviceTitle: string;
  basePrice: number;
  label: string;
  raw: number;
  rounded: number;
  /** The rounding moved the price by more than 5%. */
  largeStep: boolean;
}
