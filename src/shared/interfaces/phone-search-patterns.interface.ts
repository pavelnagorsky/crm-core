/** LIKE fragments for finding stored E.164 phones ("+375292332000") by typed digits. */
export interface PhoneSearchPatterns {
  /** Digits that may occur anywhere in the stored phone. */
  contains: string;
  /** Stored-phone prefixes a national trunk prefix stands for ("8029…" means "+37529…"). */
  trunkPrefixes: string[];
  /** Stored-phone prefixes that rank a client first: the number starts with what was typed. */
  rankPrefixes: string[];
}
