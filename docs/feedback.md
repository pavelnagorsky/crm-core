# Feedback API

`POST /public/feedback` — public contact form, no registration required.

```json
{
  "name": "Павел",
  "company": null,
  "phone": "+375 29 000-00-00",
  "email": null,
  "message": null
}
```

Name is required (up to 100 characters). At least one of phone or email is
required. Phone numbers are normalized using the project's phone rules; emails
are trimmed and lowercased. Empty contacts are treated as absent. Company (255)
and message (5000) are optional and nullable; blank values are stored as null.
The response is HTTP 201 with `BaseResponseDto.success({ id })`.

All administration routes require an access token for a platform administrator
(`UserRole.ADMIN`). Business owners and managers do not have access.

| Method | Route                 | Purpose                                  |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/admin/feedback`     | Paginated list and search                |
| GET    | `/admin/feedback/:id` | Full request, including internal notes   |
| PATCH  | `/admin/feedback/:id` | Update status and/or notes               |
| DELETE | `/admin/feedback/:id` | Permanently delete; HTTP 204, empty body |

List query: `page`, `pageSize`, `search`, `status`, `orderBy`
(`createdAt`, `updatedAt`, `status`), `orderDirection` (`asc`, `desc`), `isExport`.
Defaults: page 1, 25 items, newest first. Search matches name, company, phone,
email, message and notes, ignoring case. Results use the standard pagination
response (`items`, `page`, `totalItems`, `totalPages`, `isExport`).

New requests start with `NEW`. Admins can choose any status: `NEW`, `IN_PROGRESS`,
`DONE`, `SPAM`, including reopening a request. Reading does not change status.

```json
{
  "status": "IN_PROGRESS",
  "notes": "Позвонить завтра после 14:00"
}
```

Notes are one editable internal text field (up to 10000 characters), without a
comment history. Omitted fields remain unchanged; `notes: null` or blank clears
notes. Null status and updates without status or notes are rejected. Public
creation never accepts status or notes and returns only the request ID.

Deployment: run `npm run db:generate` and `npm run db:deploy`. The migration adds
the Feedback table and status enum; a SQL check also requires at least one contact.
