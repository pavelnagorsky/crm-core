/** LIKE fragments for finding stored E.164 phones ("+375292332000") by typed digits. */
export interface PhoneSearchPatterns {
  /** Typed digits without a trunk or international prefix; a search needs at least 3. */
  significant: string;
  /** Digits that may occur anywhere in the stored phone. */
  contains: string;
  /** Stored-phone prefixes a trunk prefix stands for ("8029…" and "029…" mean "+37529…"). */
  trunkPrefixes: string[];
  /** Stored-phone prefixes that rank a client first: the number starts with what was typed. */
  rankPrefixes: string[];
}
