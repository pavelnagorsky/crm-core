export const OAUTH_HTTP_OPTIONS = {
  timeout: 10_000,
} as const;

export const OAUTH_FORM_HTTP_OPTIONS = {
  ...OAUTH_HTTP_OPTIONS,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
} as const;
