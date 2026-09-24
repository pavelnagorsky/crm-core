const regularExpressions = {
  slugPattern: /^[a-z0-9-]*$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/,
  coordinates: /^\d+\.\d+;\d+\.\d+$/,
  specialChars: /^[^a-zA-Z0-9]/,
  // E.164: + followed by 7–15 digits
  phone: /^\+\d{7,15}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
  // Local datetime without any timezone offset or Z — e.g. 2026-09-20T10:00:00
  localDateTime: /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
  // Positive decimal number — e.g. 49, 49.1, 49.99, 49.3223
  positiveDecimal: /^\d+(\.\d+)?$/,
  // Signed decimal — e.g. -12.50, 12.50
  signedDecimal: /^-?\d+(\.\d+)?$/,
  // Percent 0–100 with up to 2 decimal places
  percent: /^(100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/,
  // RF INN (10/12) or RB UNP (9)
  taxId: /^\d{9,12}$/,
};

export default regularExpressions;
