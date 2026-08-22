# Step 17G — Excel Hardening and Documentation Finalization

## Status

```text
Step 17A — Excel Intake + Mapping Discovery       ✅ COMPLETE
Step 17B — Spreadsheet Infrastructure             ✅ COMPLETE
Step 17C — Import Preview + Error Reporting       ✅ COMPLETE
Step 17D — Historical Task Import                 ✅ COMPLETE
Step 17E — Member Data Import                     ✅ COMPLETE
Step 17F — XLSX Exports                           ✅ COMPLETE
Step 17G — Hardening + Documentation              ✅ COMPLETE
```

Step 17G closes the Excel subsystem. It does not add new Excel capabilities.

## Final Supported Excel Scope

### Import

```text
MEMBER_LEGACY_V1
→ preview
→ error report
→ existing Member designation enrichment

HISTORICAL_TASK_LEGACY_V1
→ preview
→ error report
→ terminal historical Task import
```

### Export

```text
Tasks XLSX
Member Performance XLSX
Team Performance XLSX
Dashboard Workload XLSX
Dashboard Trends XLSX
Management Reports XLSX
```

## Final Deferred Excel Scope

```text
CSV
PDF
stored exports
scheduled exports
emailed exports
new legacy profiles
Excel account creation
Excel identity mutation
Excel Team transfer
active Task cutover
Management Report attachments
fixed report templates or cadence
```

## Hardening Decisions

- SheetJS Community Edition 0.20.3 remains the only spreadsheet dependency.
- SheetJS is isolated behind `src/shared/spreadsheet/`.
- Import preview, error reports, and execution never accept a client-selected mapping profile.
- Export datasets reuse canonical scoped reads and calculators.
- Exports write no database rows, ActivityLog, Notification, FileAsset, Cloudinary object, SMTP message, local file, or ExportJob.
- Formula-like business text is written as safe text.
- Real numeric values remain numeric cells.
- Export Date cells follow the UTC export contract.
- Long text fails with `EXPORT_CELL_VALUE_TOO_LARGE`; it is not silently truncated.
- Export row and cell limits reject oversized workbooks before workbook generation.

## Query and Memory Review

- Export reads use canonical Task, Performance, Dashboard, and Management Report services.
- Task, Member Performance, Dashboard Member workload, and Management Report exports use bounded `MAX + 1` output reads where practical.
- Team Performance and Dashboard Team workload intentionally use canonical metric source reads so REST and XLSX keep one definition of each metric.
- No Excel only metric aggregation was introduced.
- No index migration was added because no representative query plan evidence was available in this environment.

## Environment Contract

- `FRONTEND_URL` is the CORS and Better Auth trusted origin list.
- `FRONTEND_APP_URL` is the browser deep-link URL used in email content.
- SMTP uses `SMTP_*` variables only.
- `FILE_STORAGE_ENABLED` is the administrative switch for upload, delete, and download storage behavior.
- `THROTTLE_TTL_MS` is measured in milliseconds.
- `THROTTLE_LIMIT` is the request count per throttle window.
- Swagger defaults to disabled in production when `SWAGGER_ENABLED` is omitted.
- Runtime `.env` files are local or deployment secrets and must not be committed.

## Verification Boundary

Static and unit verification:

```bash
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:unit
pnpm why xlsx
git diff --check
```

Integration verification requires an isolated `TEST_DATABASE_URL`.

Migration verification must intentionally point Prisma CLI `DATABASE_URL` at an isolated disposable database. `TEST_DATABASE_URL` alone does not change Prisma CLI behavior.

## Closure Rule

After Step 17G, do not expand Excel into CSV, PDF, new import profiles, scheduled exports, stored exports, export email, or additional migration behavior without a new approved plan.
