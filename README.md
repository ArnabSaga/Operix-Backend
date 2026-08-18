# Operix Backend

Backend API for **Operix**, the Pharmaceutical Workload & Operations Management Platform.

The current repository contains the NestJS backend foundation, Prisma schema foundation, and Better Auth authentication foundation. RBAC guards, user management, task workflow, reports, analytics, notification delivery, and inventory are not implemented yet.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.28.0
- PostgreSQL for future database backed features

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

The application validates its runtime environment before starting. Update `DATABASE_URL` and `FRONTEND_URL` in `.env` for your environment.

## Environment

| Variable                    |            Required | Purpose                                                     |
| --------------------------- | ------------------: | ----------------------------------------------------------- |
| `NODE_ENV`                  |                 Yes | `development`, `test`, or `production`                      |
| `PORT`                      |                 Yes | HTTP port from 1 through 65535                              |
| `DATABASE_URL`              |                 Yes | PostgreSQL connection string used lazily by Prisma          |
| `FRONTEND_URL`              |                 Yes | One origin or a comma separated CORS allowlist              |
| `SWAGGER_ENABLED`           |                 Yes | Enables or disables Swagger                                 |
| `BETTER_AUTH_SECRET`        |                 Yes | Better Auth session and token secret                        |
| `BETTER_AUTH_URL`           |                 Yes | Backend origin used by Better Auth                          |
| `TEST_DATABASE_URL`         | Database tests only | Isolated PostgreSQL database for database integration tests |
| `SEED_SUPER_ADMIN_EMAIL`    |           Seed only | Initial Super Admin email                                   |
| `SEED_SUPER_ADMIN_PASSWORD` |           Seed only | Initial Super Admin password, never log this                |
| `SEED_SUPER_ADMIN_NAME`     |           Seed only | Initial Super Admin display name                            |

## API

The API prefix is `/api/v1`.

```http
GET /api/v1/health
```

The health endpoint reports application liveness and does not query PostgreSQL.

Better Auth native routes are mounted under `/api/v1/auth`.

```http
POST /api/v1/auth/sign-in/email
POST /api/v1/auth/sign-out
GET  /api/v1/auth/get-session
GET  /api/v1/auth/me
```

Public signup is disabled. Use the seed command to create the first trusted Super Admin after confirming `DATABASE_URL` points to the intended development database.

Swagger is available at `/api/docs` when `SWAGGER_ENABLED=true`.

API errors use this shape:

```json
{
  "success": false,
  "message": "Resource not found",
  "code": "RESOURCE_NOT_FOUND",
  "details": null
}
```

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

## Verification

```bash
pnpm install --frozen-lockfile
pnpm verify
git diff --check
```

Generated Prisma code is written to `generated/prisma` and is not committed or processed by formatting and linting tools.
