# Project Rules

## File structure

- One class, enum, or interface per file — no exceptions.
- Place each file in the folder matching its type:
  - `dto/` — request/response DTOs
  - `interfaces/` — TypeScript interfaces
  - `enums/` — enums
  - `guards/` — guards
  - `decorators/` — decorators
  - `pipes/` — pipes
- Never declare interfaces or enums inline inside service/controller files.

## Exceptions

- For simple HTTP errors use NestJS built-ins: `NotFoundException`, `ForbiddenException`, `UnauthorizedException`, `BadRequestException`.
- For domain errors: add an entry (code + message pair) to `ErrorCode` (`src/shared/validation/error-codes.enum.ts`) and throw `AppException` directly:
  ```ts
  // in error-codes.enum.ts
  CATEGORY_NAME_EXISTS: { code: 'CATEGORY_NAME_EXISTS', message: 'Category name already exists in this business' },

  // at throw site
  throw new AppException(ErrorCode.CATEGORY_NAME_EXISTS, HttpStatus.CONFLICT);
  ```
- **Never create custom exception subclasses** (`class FooException extends AppException`). `AppException` + `ErrorCode` entry is the full pattern.
- **Never pass a message string to `AppException`** — the message lives in the `ErrorCode` entry.

## Regular expressions

- Never define regex patterns inline in DTOs or decorators.
- Add them to `src/shared/regular-expressions.ts` and import from there.

## Prisma error codes

- Never use raw Prisma error strings. Use `PrismaErrorCode` from `src/shared/database/prisma-error-codes.ts`:
  ```ts
  if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) ...
  ```
- Add new codes to `PrismaErrorCode` as needed.

## Architecture: layers and domain ownership

Each module owns its domain. Data access for a given entity lives only in the service that owns it:
- `StaffService` — owns `staff`, `staffShift`, `staffService` tables.
- `CalendarService` — owns `calendarEvent`, `calendarEventCancelledOccurrence` tables.
- `ClientsService` — owns `client` table.
- `BookingCreateService` — owns `business`, `service`, `booking` tables. All other data comes through injected services.

**Never query another domain's tables directly.** If `BookingCreateService` needs shift or calendar event data, it calls `CalendarService` or `StaffService` — never touches those tables itself.

**`CalendarComputeService` is a private computation helper for `CalendarModule` only.** No other module imports or injects it. Slot/availability logic is exposed through `CalendarService` as the public API.

**Computation services** (e.g. `CalendarComputeService`) handle pure logic — no DB access, no cross-module calls. They are private to their module and never exported.

**Service method contracts:**
- Expose named domain operations with clear intent (e.g. `isSlotFree`, `resolveForBooking`). Do not expose raw query helpers or internal methods.
- Cross-domain data needs are satisfied by calling the owning service, not by importing that service's DB model or querying its tables.
- Exception: a transactional re-check that must run inside an open `$transaction` may pass already-fetched entities to a pure computation method. Mark the call site with a comment explaining the reason.

## Services / Controllers

- Services return Prisma models, not DTOs. DTO mapping happens in the controller.
- DELETE endpoints return `204 No Content` — no body, no `@HttpCode(HttpStatus.OK)`, return type is `Promise<void>`. Use `@ApiNoContentResponse()` in Swagger.
- All endpoints wrap their response in `BaseResponseDto` via `BaseResponseDto.success(...)`. Return type is always `Promise<BaseResponseDto<T>>`.
- Search/list endpoints with pagination must use `PaginationRequestDto` (extend it for the request) and `PaginationResponseDto` (extend it for the response). The controller wraps the result in `BaseResponseDto.success(...)` as usual:
  ```ts
  // request DTO
  export class MySearchRequestDto extends PaginationRequestDto<MyOrderByEnum> {
    @IsOptional() @IsString() search?: string;
  }

  // response DTO
  export class MySearchResponseDto extends PaginationResponseDto {
    @ApiProperty({ type: () => MyItemDto, isArray: true })
    items: MyItemDto[];

    constructor(items: MyItemDto[], page: number, pageSize: number, totalItems: number, isExport = false) {
      super(page, pageSize, totalItems, isExport);
      this.items = items;
    }
  }

  // controller
  @ApiOkResponse({ type: ApiResponse(MySearchResponseDto) })
  async search(...): Promise<BaseResponseDto<MySearchResponseDto>> {
    const { items, totalItems } = await this.myService.search(businessId, dto);
    return BaseResponseDto.success(
      new MySearchResponseDto(items.map(MyItemDto.fromEntity), dto.page, dto.pageSize, totalItems, dto.isExport),
    );
  }
  ```

## NestJS modules

**Exports**
- Do not add a provider to `exports` until another module explicitly imports this module and needs that provider.
- If nothing imports a module, it exports nothing.

**Imports**
- Only import a module if a provider in the current module directly depends on something from it.
- Never import a module "just in case" or for transitive access — go through the module that owns the provider.

**Circular dependencies**
- Circular module references (`ModuleA` imports `ModuleB` imports `ModuleA`) are a design smell — restructure instead of using `forwardRef`.
- If a genuine circular dependency exists and cannot be avoided, use `forwardRef(() => Module)` on both sides and document why in a comment. This is the only case where a comment is warranted.
- If two modules constantly need each other, extract the shared logic into a third module that both import.

**General**
- Each module owns its own providers — never reach into another module's internals by importing its service directly without going through that module's public API (`exports`).

## Git conventions

Commit titles and branch names follow the same `type/slug` pattern:

- `fix/bug-title`
- `feature/feature-name`
- `refactor/refactor-topic`

Use lowercase kebab-case for the slug. The slug should be short and descriptive.
