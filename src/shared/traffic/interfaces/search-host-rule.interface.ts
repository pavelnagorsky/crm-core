/** A search engine domain, itself or a subdomain, and the engine name kept as the detail. */
export interface SearchHostRule {
  domain: string;
  engine: string;
}
