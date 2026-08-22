# Operix Backend

Backend API for **Operix**, the Pharmaceutical Workload and Operations Management Platform.

Operix replaces Excel based operational workload tracking with a role scoped workflow system. The backend currently supports authentication and RBAC, Admin and Member management, Teams, Task lifecycle, submissions, reviews, Activity, Notifications, `TASK_ASSIGNED` SMTP email, Performance, Dashboard analytics, Admin submitted Management Reports, Task and Submission attachments, Excel import, and dynamic XLSX exports.

Inventory, real time transport, CSV, PDF, stored exports, scheduled exports, export email delivery, Management Report attachments, and advanced production hardening remain deferred.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.28.0
- PostgreSQL

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate
pnpm dev
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env
```

The application validates its runtime environment before starting. Update `.env` locally, but do not commit it.

## Environment

| Variable                    |      Requirement | Purpose                                                                                  |
| --------------------------- | ---------------: | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | Runtime required | `development`, `test`, or `production`                                                   |
| `PORT`                      | Runtime optional | HTTP port. Defaults to `5000`                                                            |
| `DATABASE_URL`              | Runtime required | PostgreSQL connection string                                                             |
| `FRONTEND_URL`              | Runtime required | One origin or a comma separated CORS and trusted origin allowlist                        |
| `FRONTEND_APP_URL`          | Runtime required | Canonical browser URL used for email deep links                                          |
| `BETTER_AUTH_SECRET`        | Runtime required | Better Auth session and token secret. Minimum 32 characters                              |
| `BETTER_AUTH_URL`           | Runtime required | Backend origin used by Better Auth                                                       |
| `SWAGGER_ENABLED`           | Runtime optional | Explicit Swagger toggle. Defaults to `true` outside production and `false` in production |
| `THROTTLE_TTL_MS`           | Runtime optional | Global throttle window in milliseconds. Defaults to `60000`                              |
| `THROTTLE_LIMIT`            | Runtime optional | Global throttle request count per window. Defaults to `100`                              |
| `SMTP_ENABLED`              | Runtime optional | Enables best effort `TASK_ASSIGNED` SMTP email. Defaults to `false`                      |
| `SMTP_HOST`                 |      Conditional | Required when `SMTP_ENABLED=true`                                                        |
| `SMTP_PORT`                 |      Conditional | Required when `SMTP_ENABLED=true`                                                        |
| `SMTP_SECURE`               |      Conditional | Required boolean when `SMTP_ENABLED=true`                                                |
| `SMTP_USER`                 |      Conditional | Required when `SMTP_ENABLED=true`                                                        |
| `SMTP_PASS`                 |      Conditional | Required when `SMTP_ENABLED=true`                                                        |
| `SMTP_FROM_EMAIL`           |      Conditional | Required valid email when `SMTP_ENABLED=true`                                            |
| `SMTP_FROM_NAME`            | Runtime optional | Defaults to `Operix`                                                                     |
| `FILE_STORAGE_ENABLED`      | Runtime optional | Enables Cloudinary backed file upload, delete, and download. Defaults to `false`         |
| `CLOUDINARY_CLOUD_NAME`     |      Conditional | Required when `FILE_STORAGE_ENABLED=true`                                                |
| `CLOUDINARY_API_KEY`        |      Conditional | Required when `FILE_STORAGE_ENABLED=true`                                                |
| `CLOUDINARY_API_SECRET`     |      Conditional | Required when `FILE_STORAGE_ENABLED=true`                                                |
| `CLOUDINARY_FOLDER`         | Runtime optional | Cloudinary folder. Defaults to `operix`                                                  |
| `TEST_DATABASE_URL`         |        Test only | Isolated PostgreSQL database for integration tests                                       |
| `SEED_SUPER_ADMIN_EMAIL`    |        Seed only | Initial Super Admin email                                                                |
| `SEED_SUPER_ADMIN_PASSWORD` |        Seed only | Initial Super Admin password. Never log this                                             |
| `SEED_SUPER_ADMIN_NAME`     |        Seed only | Initial Super Admin display name                                                         |

Legacy `EMAIL_SENDER_SMTP_*` variables are not used. Use the `SMTP_*` variables above.

## API

The API prefix is `/api/v1`.

```http
GET /api/v1/health
```

Better Auth native routes are mounted under `/api/v1/auth`, with the Operix current viewer endpoint at:

```http
GET /api/v1/auth/me
```

Public signup is disabled. Use the seed command to create the first trusted Super Admin after confirming `DATABASE_URL` points to the intended database.

Swagger is available at `/api/docs` when enabled.

API errors use this shape:

```json
{
  "success": false,
  "message": "Resource not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": null
}
```

## Excel

Excel is a boundary format, not the source of operational truth.

| Capability                       | Status       |
| -------------------------------- | ------------ |
| Historical Task XLSX import      | ✅ Supported |
| Member designation XLSX import   | ✅ Supported |
| Import preview and error reports | ✅ Supported |
| Task XLSX export                 | ✅ Supported |
| Performance XLSX export          | ✅ Supported |
| Dashboard XLSX export            | ✅ Supported |
| Management Report XLSX export    | ✅ Supported |
| CSV export                       | ⬜ Deferred  |
| PDF export                       | ⬜ Deferred  |
| Stored or scheduled exports      | ⬜ Deferred  |
| Emailed exports                  | ⬜ Deferred  |

SheetJS Community Edition 0.20.3 is the only spreadsheet dependency. It must remain isolated behind `src/shared/spreadsheet/`.

## Scripts

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm prisma:generate
pnpm prisma:validate
pnpm seed:super-admin
pnpm test:unit
pnpm test:integration
pnpm build
pnpm verify
```

Use `pnpm lint:fix` and `pnpm format` only when you want files rewritten.

`pnpm verify` includes integration tests and therefore requires `TEST_DATABASE_URL`. Integration tests must never fall back to `DATABASE_URL`.

## Verification

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

Run integration tests only with an isolated PostgreSQL database:

```bash
pnpm test:integration
```

For migration verification, intentionally point Prisma CLI `DATABASE_URL` at an isolated disposable database. Do not run migration checks against a normal development or production database by accident.

Generated Prisma code is written to `generated/prisma` and is not committed or processed by formatting and linting tools.
