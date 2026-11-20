/** Labels of traffic source rows by id ("Не указан" under NONE) and of the summed details row. */
export interface TrafficSourceLabels {
  sources: Record<string, string>;
  otherDetails: string;
}
