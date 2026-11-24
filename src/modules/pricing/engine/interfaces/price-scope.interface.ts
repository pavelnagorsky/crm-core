import { QuoteRequest } from './quote-request.interface.js';

/**
 * What to price over time, without the start: a separate service with a staff member or
 * null (base price), or a bundle with a staff member per line. Same shape as a quote
 * request without the visit; the context (if any) prices discounts, its visitStartMs is treated
 * as unknown.
 */
export type PriceScope = Omit<QuoteRequest, 'visit'>;
