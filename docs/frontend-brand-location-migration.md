# Frontend Migration Brief: Brand -> Location Hierarchy

This document is for the frontend agent/team implementing the UI and API client
changes after the backend migration from a single `Business` scope to a two-level
`Brand` + `Location` hierarchy.

## Why this changed

The old model used one entity, `Business`, for two different meanings:

- tenant/brand identity: company name, logo, owner membership;
- physical operating unit: timezone, currency, booking settings, staff, services,
  bookings, calendar, payroll.

The backend now separates those concepts:

- `Brand` is the tenant root and commercial identity.
- `Location` is the operational point of sale.

This enables one brand to own multiple locations with different currencies,
timezones, staff, services, schedules, booking pages, payroll periods, and files.

## New entity model

### Brand

Brand is the top-level tenant. It owns:

- brand profile: `id`, `name`, `logo`;
- `BrandMembership[]`;
- shared clients;
- locations.

Brand-scoped routes use:

```text
/brands/:brandId/...
```

Use brand scope for:

- brand CRUD;
- locations list/create under a brand;
- clients;
- brand-level audit;
- brand-level analytics where present.

### Location

Location is the operational unit. It owns:

- `countryCode`, `currency`, `timezone`;
- profile fields: `name`, `businessType`, `city`, `addressLine`;
- booking settings: `bookingVisibility`, `slotIntervalMinutes`,
  `advanceBookingWindowDays`, `minimumBookingNoticeMinutes`,
  `isBookingConfirmationRequired`;
- staff;
- services/catalog;
- calendar;
- bookings;
- booking pages/widgets;
- files;
- dashboard;
- payroll and staff earnings;
- location-level audit.

Location-scoped routes use:

```text
/locations/:locationId/...
```

Important: operational routes do not carry `brandId`. A `locationId` is globally
unique and the backend derives the parent brand.

### Memberships and roles

The token now contains two membership levels:

```ts
type AccessTokenPayload = {
  sub: string;
  role: 'ADMIN' | string;
  firstName?: string;
  lastName?: string;
  brandMemberships: Array<{
    brandId: string;
    role: 'OWNER' | 'STAFF';
  }>;
  locationMemberships: Array<{
    locationId: string;
    brandId: string;
    role: 'OWNER' | 'STAFF';
  }>;
  tokenEpoch: number;
};
```

Access rules:

- `ADMIN` can access everything.
- Brand routes require a matching `brandMembership`.
- Location routes allow either a matching `locationMembership` or a
  `brandMembership` for the parent brand.
- A brand owner can access all locations of that brand after the token payload is
  fresh.

## Token invalidation and refresh flow

The backend now invalidates stale access-token payloads automatically.

Frontend must not manually invalidate tokens after creating locations, changing
memberships, changing roles, or accepting invitations. The backend bumps the
user token epoch and rejects stale payloads.

When an access token is stale, the backend returns:

```json
{
  "isSuccess": false,
  "responseCode": "TOKEN_PAYLOAD_STALE",
  "responseMessage": "Access token payload is stale; refresh and retry the request",
  "responseValue": {
    "action": "REFRESH_ACCESS_TOKEN",
    "reason": "TOKEN_EPOCH_CHANGED"
  }
}
```

HTTP status is `409 Conflict`.

The `reason` can also be:

```text
LOCATION_MAPPING_MISSING
```

This happens when a location exists but the current access-token payload does not
yet contain its `locationId -> brandId` mapping.

Frontend behavior:

1. On `responseCode === 'TOKEN_PAYLOAD_STALE'`, call `POST /auth/refresh`.
2. Store the new access token and refresh token returned by the backend.
3. Retry the original request once.
4. If the retried request returns `TOKEN_PAYLOAD_STALE` again, stop retrying,
   clear auth state or show a re-login/error state. Do not loop forever.

Do not implement manual token invalidation. Do not try to patch membership arrays
inside a decoded token. Treat the access token as backend-owned state.

## Response contract

All normal API responses are wrapped:

```ts
type BaseResponseDto<T> = {
  isSuccess: boolean;
  responseCode: string;
  responseMessage: string;
  responseValue: T | null;
};
```

Success:

```json
{
  "isSuccess": true,
  "responseCode": "SUCCESS",
  "responseMessage": "Success",
  "responseValue": {}
}
```

Error:

```json
{
  "isSuccess": false,
  "responseCode": "CLIENT_PHONE_EXISTS",
  "responseMessage": "A client with this phone number already exists in this business",
  "responseValue": null
}
```

Frontend should branch on `responseCode`, not on `responseMessage`. Some current
messages still contain legacy wording such as "business"; the code is the stable
contract.

## Scope rules for screens

### Brand-level screens

Use `brandId` for:

- brand settings;
- locations list;
- create location;
- clients;
- client import/export;
- client analytics;
- brand audit.

Clients are shared across a brand. They are no longer location-scoped.

### Location-level screens

Use `locationId` for:

- staff;
- staff shifts and invitations;
- service categories;
- services;
- service bundles;
- service catalog;
- files;
- calendar;
- bookings;
- booking analytics;
- booking pages;
- booking widgets;
- dashboard widgets;
- payroll periods;
- payroll earnings;
- staff compensation;
- location audit.

The UI should keep a current selected `locationId` for operational pages.

## Route map

### Auth and current user

```text
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/confirm-email
POST /auth/reset-password-request
POST /auth/reset-password
POST /auth/google
POST /auth/vk
POST /auth/yandex

GET  /users/me
PUT  /users/me
```

### Brands

```text
POST   /brands
GET    /brands
GET    /brands/:brandId
PUT    /brands/:brandId
GET    /brands/:brandId/public
DELETE /brands/:brandId
```

Brand response:

```ts
type BrandResponse = {
  id: string;
  name: string;
  logo: FileResponse | null;
  createdAt: string;
  updatedAt: string;
};
```

### Locations

```text
POST   /brands/:brandId/locations
GET    /brands/:brandId/locations
GET    /locations/:locationId
PUT    /locations/:locationId
GET    /locations/:locationId/public
DELETE /locations/:locationId
```

Location response:

```ts
type LocationResponse = {
  id: string;
  brandId: string;
  name: string;
  countryCode: string;
  currency: string;
  timezone: string;
  businessType: BusinessType | null;
  city: string | null;
  addressLine: string | null;
  advanceBookingWindowDays: number;
  slotIntervalMinutes: number;
  minimumBookingNoticeMinutes: number;
  bookingVisibility: BookingVisibility;
  isBookingConfirmationRequired: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Public location response:

```ts
type LocationPublicResponse = {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  logo: FileResponse | null;
  timezone: string;
  currency: string;
  bookingVisibility: BookingVisibility;
};
```

`countryCode`, `currency`, and `timezone` are immutable after location creation.
An update attempt returns `LOCATION_ANCHORS_IMMUTABLE`.

### Clients

Base path:

```text
/brands/:brandId/clients
```

Routes:

```text
POST   /brands/:brandId/clients
POST   /brands/:brandId/clients/import
PUT    /brands/:brandId/clients/:id
PATCH  /brands/:brandId/clients/:id/ban
GET    /brands/:brandId/clients/export
GET    /brands/:brandId/clients/:id
GET    /brands/:brandId/clients
POST   /brands/:brandId/clients/analytics
```

Body/query DTOs must not send `businessId` or `locationId` for clients.
Use only the path `brandId`.

### Staff

```text
POST   /locations/:locationId/staff
PUT    /locations/:locationId/staff/:id
GET    /locations/:locationId/staff/status-counts
GET    /locations/:locationId/staff/export
GET    /locations/:locationId/staff/:id
GET    /locations/:locationId/staff
PATCH  /locations/:locationId/staff/:id/status
DELETE /locations/:locationId/staff/:id
GET    /locations/:locationId/staff/:id/shifts
PUT    /locations/:locationId/staff/:id/shifts
POST   /locations/:locationId/staff/:id/invitations
POST   /staff/invitations/accept
GET    /locations/:locationId/staff/widgets
```

Staff belongs to exactly one location.

### Services and catalog

Base path:

```text
/locations/:locationId
```

Routes:

```text
POST   /locations/:locationId/service-categories
GET    /locations/:locationId/service-categories
PUT    /locations/:locationId/service-categories/:categoryId
DELETE /locations/:locationId/service-categories/:categoryId

POST   /locations/:locationId/services
PUT    /locations/:locationId/services/:id
GET    /locations/:locationId/services/:id
PATCH  /locations/:locationId/services/:id/status
DELETE /locations/:locationId/services/:id

GET    /locations/:locationId/service-catalog/counts
GET    /locations/:locationId/service-catalog

POST   /locations/:locationId/service-bundles
GET    /locations/:locationId/service-bundles/:id
PUT    /locations/:locationId/service-bundles/:id
PATCH  /locations/:locationId/service-bundles/:id/status
DELETE /locations/:locationId/service-bundles/:id

POST   /locations/:locationId/services/analytics
```

Catalog is per-location, not shared across the brand.

### Calendar

Base path:

```text
/locations/:locationId/calendar
```

Routes:

```text
GET    /locations/:locationId/calendar/public/available-slots
GET    /locations/:locationId/calendar/available-slots
GET    /locations/:locationId/calendar
GET    /locations/:locationId/calendar/:eventId
POST   /locations/:locationId/calendar
PUT    /locations/:locationId/calendar/:eventId/occurrence
PUT    /locations/:locationId/calendar/:eventId
DELETE /locations/:locationId/calendar/:eventId
```

Timezone comes from the location.

### Bookings

Public booking routes:

```text
GET  /public/locations/:locationId/booking-setup
POST /public/locations/:locationId/booking-resolve
POST /public/locations/:locationId/bookings
GET  /public/bookings/me
POST /public/bookings/me/cancel
```

Authenticated booking routes:

```text
POST   /locations/:locationId/bookings/manual
GET    /locations/:locationId/bookings/status-counts
GET    /locations/:locationId/bookings/export
GET    /locations/:locationId/bookings/:id
GET    /locations/:locationId/bookings
PUT    /locations/:locationId/bookings/:id
PATCH  /locations/:locationId/bookings/:id/status
POST   /locations/:locationId/bookings/:id/client-token
POST   /locations/:locationId/bookings/:id/cancel
DELETE /locations/:locationId/bookings/:id
POST   /locations/:locationId/bookings/analytics
```

Booking create/search/export DTOs no longer carry `locationId`. The path is the
source of truth.

If a booking item route is called with a mismatched `:locationId`, backend returns
not found instead of operating through the wrong URL.

### Booking channels

Public:

```text
GET /public/booking-pages/:slug
GET /public/booking-widgets/:widgetId
```

Management:

```text
GET    /locations/:locationId/booking-pages/slug-availability
GET    /locations/:locationId/booking-pages
POST   /locations/:locationId/booking-pages
GET    /locations/:locationId/booking-pages/:pageId
PUT    /locations/:locationId/booking-pages/:pageId
PATCH  /locations/:locationId/booking-pages/:pageId/status
DELETE /locations/:locationId/booking-pages/:pageId

GET    /locations/:locationId/booking-widgets
POST   /locations/:locationId/booking-widgets
GET    /locations/:locationId/booking-widgets/:widgetId
PUT    /locations/:locationId/booking-widgets/:widgetId
PATCH  /locations/:locationId/booking-widgets/:widgetId/status
DELETE /locations/:locationId/booking-widgets/:widgetId
```

Public booking page/widget responses now expose `location`, not `business`.

### Files

```text
POST   /locations/:locationId/files
DELETE /locations/:locationId/files/:fileId
```

Files are location-scoped.

### Dashboard

```text
POST /locations/:locationId/dashboard/widgets
```

Dashboard is location-scoped by default.

### Payroll

Payroll periods:

```text
POST   /locations/:locationId/payroll/periods
GET    /locations/:locationId/payroll/locked-ranges
GET    /locations/:locationId/payroll/periods
GET    /locations/:locationId/payroll/periods/status-counts
GET    /locations/:locationId/payroll/periods/:id
GET    /locations/:locationId/payroll/periods/:id/report
GET    /locations/:locationId/payroll/periods/:id/earnings
GET    /locations/:locationId/payroll/periods/:id/export/vedomost
GET    /locations/:locationId/payroll/periods/:id/export/payslips
POST   /locations/:locationId/payroll/periods/:id/calculate
POST   /locations/:locationId/payroll/periods/:id/approve
POST   /locations/:locationId/payroll/periods/:id/pay
DELETE /locations/:locationId/payroll/periods/:id
POST   /locations/:locationId/payroll/results/:id/corrections
```

Earnings:

```text
GET  /locations/:locationId/payroll/earnings
GET  /locations/:locationId/staff/:id/earnings
POST /locations/:locationId/staff/:id/earnings
POST /locations/:locationId/payroll/product-sales
```

Compensation:

```text
GET /locations/:locationId/staff/:id/compensation/current
GET /locations/:locationId/staff/:id/compensation
PUT /locations/:locationId/staff/:id/compensation
```

Payroll create/search/earning DTOs no longer carry `locationId`. The path is the
source of truth.

### Audit

```text
GET /brands/:brandId/audit
GET /locations/:locationId/audit
```

## Frontend state model recommendation

Keep these IDs separately:

```ts
type WorkspaceState = {
  currentBrandId: string | null;
  currentLocationId: string | null;
};
```

Suggested flow after login:

1. Decode/store tokens as usual.
2. Fetch `GET /brands`.
3. Select a brand.
4. Fetch `GET /brands/:brandId/locations`.
5. Select a location for operational screens.
6. Use brand routes for clients/brand settings.
7. Use location routes for day-to-day operations.

After creating a new location:

1. Backend bumps token epoch for affected users.
2. The next protected request may return `TOKEN_PAYLOAD_STALE`.
3. Frontend refreshes once and retries.
4. Re-fetch brand locations if the location list is visible.

No manual token invalidation is needed.

## DTO migration checklist

Remove these fields from frontend request DTOs where they were previously sent in
body/query:

- `businessId` for all migrated routes;
- `locationId` for location-scoped create/search/export routes where the route
  already has `:locationId`;
- `brandId` in client DTO body/query where the route already has `:brandId`.

Do not remove `locationId` or `brandId` from response DTO handling. Responses
still include those IDs for rendering, caching, routing, and sanity checks.

## UI copy changes

Replace old "business" copy with:

- "brand" for tenant/profile/client-sharing concepts;
- "location" for operational screens, booking settings, schedule, services,
  staff, payroll, files.

Examples:

- "Business settings" -> "Brand settings" if editing name/logo.
- "Business timezone" -> "Location timezone".
- "Business clients" -> "Brand clients".
- "Business staff" -> "Location staff".

## Common pitfalls

- Do not put `locationId` in request body just because the old DTO had it.
- Do not use `brandId` for operational endpoints.
- Do not assume a brand has only one location.
- Do not assume all locations in a brand share currency or timezone.
- Do not sum money across locations with different currencies unless grouped by
  currency.
- Do not branch frontend logic on backend error messages. Use `responseCode`.
- Do not manually rewrite JWT payload membership lists.
- Do not retry stale-token requests indefinitely.
