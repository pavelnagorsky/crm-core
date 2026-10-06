# Frontend Custom Errors

Backend errors are returned in the same response wrapper as successful responses:

```ts
type BaseResponseDto<T = unknown> = {
  isSuccess: boolean;
  responseCode: string;
  responseMessage: string;
  responseValue: T | null;
};
```

Example:

```json
{
  "isSuccess": false,
  "responseCode": "BOOKING_SLOT_UNAVAILABLE",
  "responseMessage": "The requested slot is not available",
  "responseValue": null
}
```

Frontend rules:

- Use `responseCode` as the stable machine-readable key.
- Do not branch on `responseMessage`; it is backend/default copy and may change.
- Some current messages still contain legacy "business" wording after the
  Brand/Location migration. Treat the code as canonical.
- Built-in HTTP exceptions are normalized to generic codes where possible:
  `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, or
  `INTERNAL_ERROR`.
- Validation errors use `VALIDATION_ERROR`; field-level details, when present,
  are in `responseValue`.

## Special auth handling

### TOKEN_PAYLOAD_STALE

`TOKEN_PAYLOAD_STALE` means the access token is valid cryptographically, but its
embedded membership/location payload is stale.

Typical HTTP status:

```text
409 Conflict
```

Possible payload:

```json
{
  "action": "REFRESH_ACCESS_TOKEN",
  "reason": "TOKEN_EPOCH_CHANGED"
}
```

or:

```json
{
  "action": "REFRESH_ACCESS_TOKEN",
  "reason": "LOCATION_MAPPING_MISSING"
}
```

Frontend behavior:

1. Call `POST /auth/refresh`.
2. Store fresh tokens.
3. Retry the original request once.
4. Stop after one retry to avoid an infinite loop.

The backend invalidates token payloads automatically. Frontend must not manually
invalidate or edit tokens after membership/location mutations.

## Error codes

### System

| Code | Default message | Frontend action |
| --- | --- | --- |
| `INTERNAL_ERROR` | Internal server error | Show generic server error. Log request context. |
| `VALIDATION_ERROR` | Validation failed | Show field errors from `responseValue` when present; otherwise show form-level validation error. |
| `BAD_REQUEST` | Bad request | Show form/request error. |
| `UNAUTHORIZED` | Unauthorized | Treat as unauthenticated; refresh if this is normal token expiry flow, otherwise send user to login. |
| `FORBIDDEN` | Forbidden | Show access-denied state. Do not retry. |
| `NOT_FOUND` | Not found | Show not-found state or remove stale item from local cache. |
| `TOKEN_PAYLOAD_STALE` | Access token payload is stale; refresh and retry the request | Refresh tokens once and retry original request. |

### Auth

| Code | Default message | Frontend action |
| --- | --- | --- |
| `EMAIL_ALREADY_IN_USE` | Email already in use | Mark email field as duplicate. |
| `PHONE_ALREADY_IN_USE` | Phone number already in use | Mark phone field as duplicate. |
| `INVALID_CREDENTIALS` | Invalid credentials | Show login/password error without revealing which field is wrong. |
| `EMAIL_NOT_CONFIRMED` | Email not confirmed | Show confirm-email flow. |
| `PASSWORD_NOT_SET` | Password not set | Route to password setup/reset flow. |
| `INVALID_RESET_CODE` | Invalid or expired reset code | Ask user to request a new code. |
| `RESET_CODE_RESEND_TOO_SOON` | Please wait before requesting a new code | Keep resend disabled and show wait message. |

### User

| Code | Default message | Frontend action |
| --- | --- | --- |
| `USER_NOT_FOUND` | User not found | Show not-found or force logout if current user disappeared. |

### Brand and locations

| Code | Default message | Frontend action |
| --- | --- | --- |
| `LOCATION_ANCHORS_IMMUTABLE` | Country, currency, and timezone cannot be changed after location creation | Do not offer anchor edits after create; show immutable-field error if returned. |

### Services and bundles

| Code | Default message | Frontend action |
| --- | --- | --- |
| `CATEGORY_NAME_EXISTS` | Category name already exists in this business | Mark category name as duplicate within the current location. |
| `SERVICE_IN_USE` | Service cannot be deleted because it is used in bookings or compensation plans | Block deletion UI and explain dependencies. |
| `SERVICE_STATUS_ALREADY_SET` | Service already has this status | Treat as idempotency conflict; refresh item. |
| `BUNDLE_FIXED_PRICE_REQUIRED` | Fixed-price bundle must have a fixed price | Mark fixed price field as required. |
| `BUNDLE_PRICE_MODE_INVALID` | Bundle pricing mode does not match fixed price value | Show bundle pricing validation. |
| `BUNDLE_ITEMS_INVALID` | Bundle must contain between 2 and 10 services | Show bundle items count validation. |

### Clients

| Code | Default message | Frontend action |
| --- | --- | --- |
| `CLIENT_PHONE_EXISTS` | A client with this phone number already exists in this business | Mark phone as duplicate within the current brand. |
| `CLIENT_BANNED` | Online booking is not available for this phone number | Public booking: show unavailable message for this phone. |
| `CLIENT_BAN_ALREADY_SET` | Client ban is already in this state | Refresh client state; no destructive retry needed. |
| `CLIENT_IMPORT_FILE_MISSING` | Import file is missing | Require file selection. |
| `CLIENT_IMPORT_FILE_TOO_LARGE` | Import file exceeds the maximum allowed size | Show file size limit. |
| `CLIENT_IMPORT_FILE_UNSUPPORTED` | Import file must be an .xlsx spreadsheet | Restrict file picker to `.xlsx`. |
| `CLIENT_IMPORT_FILE_CORRUPT` | Import file could not be read | Ask user to re-export/fix file. |
| `CLIENT_IMPORT_MISSING_COLUMNS` | Import file is missing required columns | Show required import columns. |
| `CLIENT_IMPORT_FILE_EMPTY` | Import file has no client rows | Tell user the spreadsheet has no importable rows. |
| `CLIENT_IMPORT_TOO_MANY_ROWS` | Import file exceeds the row limit | Ask user to split file. |

### Staff and invitations

| Code | Default message | Frontend action |
| --- | --- | --- |
| `STAFF_STATUS_ALREADY_SET` | Staff member already has this status | Refresh staff state. |
| `STAFF_HAS_BOOKINGS` | Staff member cannot be deleted because they have associated bookings | Block deletion and explain dependency. |
| `STAFF_INVITATION_NOT_FOUND` | Invitation not found or already used | Show invalid/used invitation page. |
| `STAFF_INVITATION_EXPIRED` | Invitation has expired | Show expired invitation page and request a new invite. |
| `STAFF_ALREADY_LINKED` | This staff member is already linked to a user account | Show linked-account conflict. |
| `STAFF_USER_ALREADY_MEMBER` | You are already a member of this business | Treat invitation as already accepted for this location; refresh workspace. |
| `STAFF_HAS_EARNINGS` | Staff member cannot be deleted because they have associated earnings | Block deletion and explain payroll dependency. |

### Files

| Code | Default message | Frontend action |
| --- | --- | --- |
| `FILE_TOO_LARGE` | File exceeds the maximum allowed size | Show max file size before upload when possible. |
| `FILE_INVALID_TYPE` | File type is not allowed | Restrict accepted MIME/extensions. |
| `FILE_UPLOAD_FAILED` | Failed to upload file to storage | Show retry option. |
| `FILE_NOT_FOUND` | File not found | Remove stale file reference or show not-found. |
| `FILE_DELETE_FAILED` | Failed to delete file from storage | Show retry option. |

### Bookings

| Code | Default message | Frontend action |
| --- | --- | --- |
| `BOOKING_NOT_AVAILABLE` | Online booking is not available for this business | Public booking: show closed/unavailable state for the location. |
| `BOOKING_ALREADY_CANCELLED` | Booking is already cancelled | Refresh booking and show cancelled state. |
| `BOOKING_BUSINESS_NOT_FOUND` | Business not found | Treat as location/resource not found in current migrated API. |
| `BOOKING_SERVICE_NOT_FOUND` | Service not found | Refresh service catalog; selected service is stale. |
| `BOOKING_BUNDLE_NOT_FOUND` | Bundle not found | Refresh service catalog; selected bundle is stale. |
| `BOOKING_SELECTION_CONFLICT` | Set either services or a bundle, not both | Fix booking form: choose bundle or services, not both. |
| `BOOKING_ITEM_NOT_FOUND` | Booking item not found | Refresh booking; edited item is stale. |
| `BOOKING_SERVICE_INACTIVE` | Service is not available for booking | Refresh catalog; show inactive/unavailable service. |
| `BOOKING_STAFF_NOT_FOUND` | Staff member not found or does not perform this service | Refresh staff/service compatibility. |
| `BOOKING_SLOT_UNAVAILABLE` | The requested slot is not available | Refresh available slots and ask user to choose another time. |
| `BOOKING_NO_STAFF_AVAILABLE` | No staff available for this service at the requested time | Refresh availability; show no-staff state. |
| `BOOKING_SLOT_RANGE_TOO_LONG` | Date range cannot exceed 62 days | Limit date-range picker. |
| `BOOKING_RATE_LIMITED` | Too many booking attempts. Try again later | Throttle UI and show retry-later message. |
| `BOOKING_CHANNEL_CONFLICT` | Set either a booking page or a booking widget, not both | Fix booking attribution payload. |

### Booking channels

| Code | Default message | Frontend action |
| --- | --- | --- |
| `BOOKING_PAGE_NOT_FOUND` | Booking page not found | Show not-found or remove stale page. |
| `BOOKING_PAGE_SLUG_TAKEN` | This slug is already used | Mark slug field as unavailable. |
| `BOOKING_PAGE_SLUG_RESERVED` | This slug is reserved | Mark slug field as reserved. |
| `BOOKING_PAGE_COVER_INVALID` | Cover must be an image uploaded for this business | Require location file upload with image type. |
| `BOOKING_WIDGET_NOT_FOUND` | Booking widget not found | Show not-found or remove stale widget. |
| `BOOKING_WIDGET_TITLE_EXISTS` | A widget with this title already exists in this business | Mark title as duplicate in current location. |
| `BOOKING_CHANNEL_STATUS_ALREADY_SET` | Booking channel already has this status | Refresh channel state. |
| `BOOKING_CHANNEL_CLOSED` | Online booking is closed for this business | Public channel: show closed state. |
| `BOOKING_CHANNEL_NOT_BOOKABLE` | Publish requires an active service assigned to an active staff member | Show publish checklist: active service + active assigned staff. |
| `WIDGET_DOMAIN_NOT_ALLOWED` | This widget is not allowed on the requesting domain | Show embed/domain configuration error. |

### Compensation and payroll

| Code | Default message | Frontend action |
| --- | --- | --- |
| `COMPENSATION_PLAN_EFFECTIVE_FROM_INVALID` | New compensation plan must start after the latest existing version | Validate effective date against latest plan. |
| `COMPENSATION_SERVICE_NOT_FOUND` | One or more services for commission overrides were not found in this business | Refresh services; remove stale override IDs. |
| `PAYROLL_PERIOD_DATES_INVALID` | Payroll period end date must be on or after the start date | Validate date range. |
| `PAYROLL_PERIOD_OVERLAP` | Payroll period overlaps an existing period for this business | Show overlap conflict and refresh periods. |
| `PAYROLL_PERIOD_NOT_FOUND` | Payroll period not found | Show not-found or refresh list. |
| `PAYROLL_PERIOD_INVALID_STATUS` | Payroll period is not in a valid status for this action | Refresh period status; disable invalid transition buttons. |
| `PAYROLL_RESULT_NOT_FOUND` | Payroll result not found | Refresh payroll result list. |
| `PAYROLL_CORRECTION_NOT_ALLOWED` | Corrections are only allowed after the payroll period is approved | Disable correction action until approved. |
| `STAFF_EARNING_NOT_FOUND` | Staff earning not found | Refresh earnings list. |
| `STAFF_EARNING_ALREADY_REVERSED` | This earning has already been reversed | Refresh earning state. |
| `STAFF_EARNING_DATE_LOCKED` | Cannot add a manual earning on a date inside an approved or paid payroll period | Disable dates inside locked ranges. |
| `STAFF_EARNING_AMOUNT_INVALID` | Earning amount is invalid for this type | Validate amount by earning type. |
| `PRODUCT_COMMISSION_NOT_CONFIGURED` | Staff member has no product commission for this date | Show compensation setup requirement. |

### Dashboard

| Code | Default message | Frontend action |
| --- | --- | --- |
| `DASHBOARD_CUSTOM_RANGE_REQUIRED` | from and to are required when period is CUSTOM | Require both dates for custom dashboard period. |
| `DASHBOARD_CUSTOM_RANGE_INVALID` | Invalid dashboard date range | Validate custom range ordering/format. |

## Recommended client-side helper

```ts
function isApiError(value: unknown): value is {
  isSuccess: false;
  responseCode: string;
  responseMessage: string;
  responseValue: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).isSuccess === false &&
    typeof (value as any).responseCode === 'string'
  );
}

function shouldRefreshToken(error: unknown): boolean {
  return isApiError(error) && error.responseCode === 'TOKEN_PAYLOAD_STALE';
}
```
