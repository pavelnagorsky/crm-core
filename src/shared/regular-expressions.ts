const regularExpressions = {
  slugPattern: /^[a-z0-9-]*$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/,
  coordinates: /^\d+\.\d+;\d+\.\d+$/,
  specialChars: /^[^a-zA-Z0-9]/,
  // E.164: + followed by 7–15 digits
  phone: /^\+\d{7,15}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d$/,
};

export default regularExpressions;
