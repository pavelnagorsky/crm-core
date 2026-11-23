const regularExpressions = {
  requestId: /^[\w.-]{1,64}$/,
  slugPattern: /^[a-z0-9-]*$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/,
  passwordResetCode: /^\d{6}$/,
  coordinates: /^\d+\.\d+;\d+\.\d+$/,
  specialChars: /^[^a-zA-Z0-9]/,
  whitespace: /\s+/,
  // E.164: + followed by 7–15 digits
  phone: /^\+\d{7,15}$/,
  locationPhone: /^\+(?:375\d{9}|7\d{10})$/,
  // Every character that is not a digit, for reducing typed phones to digits
  nonDigit: /\D/g,
  // Digits of a typed phone fragment, room for 00/80 trunk prefixes
  phoneSearchDigits: /^\d{1,20}$/,
  // A search term typed as a phone: digits with spaces, brackets, dashes, dots or +
  phoneLike: /^[\d\s()+.-]+$/,
  contactScheme: /^(?:https?:[\s\S]*|(?![a-z][a-z\d+.-]*:)[\s\S]*)$/i,
  iframeStart: /^<iframe\b/i,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  // Local datetime without any timezone offset or Z — e.g. 2026-09-20T10:00:00
  localDateTime: /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
  // Calendar day before a real-date check — e.g. 2026-10-01
  calendarDate: /^\d{4}-\d{2}-\d{2}$/,
  // Numeric token before the scale check — e.g. 49, 49.5, -12.5
  decimalToken: /^-?\d+(\.\d+)?$/,
  // Non-negative money after canonicalization to 2 decimal places
  moneyAmount: /^\d+\.\d{2}$/,
  // Positive money after canonicalization to 2 decimal places: not 0.00
  positiveMoneyAmount: /^(?!0+\.00$)\d+\.\d{2}$/,
  // Prefixes of payment keys nested in order operations; clients may not use them
  reservedPaymentKeyPrefix: /^order-(?:sale|confirm|return):/,
  // Signed money after canonicalization to 2 decimal places
  signedAmount: /^-?\d+\.\d{2}$/,
  // Non-negative stock quantity with up to 3 decimal places
  quantity: /^\d+\.\d{3}$/,
  // Signed stock quantity with up to 3 decimal places
  signedQuantity: /^-?\d+\.\d{3}$/,
  // Percent 0–100 with up to 2 decimal places
  percent: /^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/,
  // Public booking page slug: lowercase segments separated by single hyphens
  bookingPageSlug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  googleTagManagerId: /^GTM-[A-Z0-9]{1,28}$/,
  yandexMetrikaId: /^[1-9][0-9]{0,14}$/,
  // CSS hex color, case-insensitive before normalization
  hexColor: /^#[0-9A-Fa-f]{6}$/,
  // Hostname label chain, ASCII only, no trailing dot
  hostname:
    /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/,
  // IPv4 with each octet in 0–255 and no leading zeros
  ipv4: /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/,
  // RF INN (10/12) or RB UNP (9)
  taxId: /^\d{9,12}$/,
  // Google review destinations as host + path: g.page/r/<id>/review, search.google.com/local/writereview, google.com/maps/place/…
  googleReviewTarget:
    /^(?:g\.page\/r\/[\w-]+\/review\/?|search\.google\.com\/local\/writereview\/?|(?:www\.)?google\.com\/maps\/place\/.+)$/,
  // Yandex Maps organization or profile pages as host + path: yandex.<tld>/maps/org/…, yandex.<tld>/profile/<id>
  yandexReviewTarget:
    /^(?:www\.)?yandex\.(?:ru|by|kz|uz|com)\/(?:maps\/org\/.+|profile\/\d+\/?)$/,
  // Imported review rating: whole number, optional zero fraction and unit — 5, 5.0, 5,0, 5 звёзд, 4 stars
  reviewRatingText: /^(\d+)(?:[.,]0+)?\s*(?:зв[её]зд[аы]?|stars?|★+)?$/i,
  // Day-first date with optional time — 05.03.2025, 5.3.2025 14:30, 05.03.2025 14:30:15
  dottedDateTime:
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  // ISO date with optional time and no offset — 2025-03-05, 2025-03-05 14:30, 2025-03-05T14:30:15.000
  isoLocalDateTime:
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/,
  // ISO date-time pinned to an offset — 2025-03-05T14:30:00Z, 2025-03-05T14:30+03:00
  isoZonedDateTime:
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i,
  // Several staff names in one cell — "Анна, Мария", "Анна; Мария", "Анна / Мария" or one per line
  staffNameSeparators: /\s*[,;/\r\n]+\s*/,
  // ISO 3166-1 alpha-2 country code — BY, RU, KZ
  countryCode: /^[A-Z]{2}$/,
  // ISO 4217 currency code — BYN, RUB
  currencyCode: /^[A-Z]{3}$/,
  // Billing plan code — master, team-plus
  billingPlanCode: /^[a-z0-9][a-z0-9-]*$/,
  // Subscription payment number as the owner writes it — KL-000123, KL000123, 123
  paymentNumber: /^(?:KL-?)?(\d{1,9})$/i,
  // Control characters stripped from client-sent traffic values
  controlChars: /\p{Cc}/gu,
  // Whitespace runs, replaced in normalized traffic tokens
  whitespaceRun: /\s+/g,
  // A UTM value that carries an email address is personal data and is dropped
  emailLike: /[^\s@]+@[^\s@]+\.[^\s@]+/,
  // Seven or more digits in a row look like a phone number and are dropped from UTM values
  longDigitRun: /\d{7,}/,
  // Characters a traffic source detail may not hold; each run becomes "_"
  trafficDetailUnsafe: /[^\p{L}\p{N}._-]+/gu,
  // Repeated underscores of a normalized traffic detail
  underscoreRun: /_{2,}/g,
  // Leading and trailing underscores of a normalized traffic detail
  edgeUnderscores: /^_+|_+$/g,
  // URL scheme at the start of a referrer, before the host is parsed out of it
  urlScheme: /^[a-z][a-z\d+.-]*:\/\//i,
  // Trailing dots of a fully qualified host
  trailingDots: /\.+$/,
  // Mobile and www prefixes stripped from a referrer host
  referrerHostPrefix: /^(?:www\d*|m)\./,
  // Country zone after a search engine name - ru, com, com.tr, co.uk
  searchEngineZone: /^[a-z]{2,3}(?:\.[a-z]{2,3})?$/,
  // Express route template that starts with a wildcard and so matches any path - *path, {*path}, {/*splat}
  catchAllRoute: /^\/?\{?\/?\*/,
};

export default regularExpressions;
