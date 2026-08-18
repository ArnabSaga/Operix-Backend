# Operix Backend

Backend API for **Operix**, the Pharmaceutical Workload & Operations Management Platform.

The current repository contains the NestJS application foundation only. Authentication, RBAC, users, tasks, submissions, reports, analytics, notifications, and inventory are intentionally not implemented yet.

## Requirements

- Node.js 22.12 or newer
- pnpm 10.28.0
- PostgreSQL for future database backed features

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate
pnpm start:dev
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env
```

The application validates its runtime environment before starting. Update `DATABASE_URL` and `FRONTEND_URL` in `.env` for your environment.

## Environment

| Variable            |            Required | Purpose                                                     |
| ------------------- | ------------------: | ----------------------------------------------------------- |
| `NODE_ENV`          |                 Yes | `development`, `test`, or `production`                      |
| `PORT`              |                 Yes | HTTP port from 1 through 65535                              |
| `DATABASE_URL`      |                 Yes | PostgreSQL connection string used lazily by Prisma          |
| `FRONTEND_URL`      |                 Yes | One origin or a comma separated CORS allowlist              |
| `SWAGGER_ENABLED`   |                 Yes | Enables or disables Swagger                                 |
| `TEST_DATABASE_URL` | Database tests only | Isolated PostgreSQL database for database integration tests |

## API

The API prefix is `/api/v1`.

```http
GET /api/v1/health
```

The health endpoint reports application liveness and does not query PostgreSQL.

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
pnpm start:dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm prisma:generate
pnpm prisma:validate
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
