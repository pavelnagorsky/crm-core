import { TrafficSource } from '../enums/traffic-source.enum.js';

/** A referrer domain that matches itself and its subdomains. */
export interface TrafficHostRule {
  domain: string;
  source: TrafficSource;
}
