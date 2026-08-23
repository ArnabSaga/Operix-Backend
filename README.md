<div align="center">

# Operix

### Pharmaceutical Workload and Operations Management Platform

**A production grade NestJS backend for replacing spreadsheet driven operations with secure workflows, audit trails, analytics, file evidence, Excel migration, and Team scoped inventory.**

<br />

[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.9.1-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Status](https://img.shields.io/badge/Status-Backend%20V1%20Core-0F766E?style=for-the-badge)](#)

<br />

[API Health](http://localhost:5000/api/v1/health) · [Swagger Docs](http://localhost:5000/api/docs) · [Architecture](./context/architecture.md) · [Progress Tracker](./context/progress-tracker.md)

</div>

<!-- ---

## Project Preview

<div align="center">

![Operix project preview](./public/preview.png)

_Preview placeholder for the Operix operational dashboard and workflow surface._

![Operix dashboard preview](./public/dashboard-preview.png)

_Preview placeholder for workload, performance, inventory, and reporting analytics._

</div>

> Screenshots are placeholders. Add real UI captures when the frontend is connected.

--- -->

## Project Overview

**Operix** is a backend platform for pharmaceutical workload and operations management. It replaces fragmented Excel trackers with a centralized, role scoped system where operational work moves through defined workflows, every important action is audited, and analytics are derived from real business data.

The platform is designed for organizations that need more than basic task CRUD. It supports Admin and Member responsibility boundaries, task assignment and submission review, immutable activity history, management report approval, file evidence, Excel migration, dynamic XLSX exports, and Inventory V1.

At its core, Operix follows one product principle:

```text
Work → Activity → Data → Analytics → Decision
```

---

## Why This Project Matters

Spreadsheet based operational tracking is flexible, but it is difficult to govern. Ownership becomes unclear, revisions overwrite history, reports drift from source data, and leadership loses confidence in the numbers.

Operix turns that workflow into a backend system with:

- strict role isolation across `SUPER_ADMIN`, `ADMIN`, and `MEMBER`;
- deterministic Task and Management Report workflows;
- immutable submission, review, Activity, and Inventory ledgers;
- derived dashboards and performance metrics from the database source of truth;
- controlled Excel import and export without making Excel a parallel database.

It is intentionally built as a serious backend product, not a demo dashboard. The interesting engineering work lives in scoped authorization, transactional workflow integrity, idempotent import behavior, safe file handling, and analytics consistency.

---

## Tech Stack

| Layer          | Technology                          | Role in the system                                                                |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Runtime        | Node.js 22.12 plus ESM              | Modern JavaScript runtime for the NestJS API                                      |
| Framework      | NestJS 11                           | Modular backend architecture, dependency injection, guards, controllers, services |
| Language       | TypeScript strict mode              | Strong compile time safety across DTOs, services, and Prisma types                |
| Database       | PostgreSQL                          | Relational source of truth, constraints, indexes, transactional integrity         |
| ORM            | Prisma 7                            | Multi file schema, generated typed client, migrations                             |
| Authentication | Better Auth                         | Session based authentication with Operix viewer context                           |
| Authorization  | Custom guards and scope policies    | Role isolation and Team scoped access control                                     |
| Files          | Cloudinary plus storage abstraction | Authenticated Task and Submission attachments                                     |
| Excel          | SheetJS CE 0.20.3                   | XLSX import preview, error reporting, controlled imports, dynamic exports         |
| Email          | Nodemailer                          | Best effort Task assignment SMTP email                                            |
| Security       | Helmet, CORS, Nest throttler        | HTTP hardening, trusted origins, rate limiting                                    |
| Testing        | Jest, Supertest                     | Unit and integration test runners                                                 |
| Tooling        | ESLint, Prettier, Prisma CLI        | Quality gates and schema verification                                             |

---

## Architecture and Internal Workflow

Operix is a decoupled backend API. The frontend consumes REST endpoints under `/api/v1`, while the backend owns authentication, authorization, business workflow, database writes, and derived analytics.

```text
Client
  ↓
NestJS HTTP Layer
  ↓
ViewerContextGuard
  ↓
AccountStatusGuard
  ↓
OperixRoleGuard
  ↓
Controller DTO validation
  ↓
Service business logic
  ↓
Serializable transaction when needed
  ↓
Prisma
  ↓
PostgreSQL
```

### Request Lifecycle

| Layer       | Responsibility                                                             |
| ----------- | -------------------------------------------------------------------------- |
| Client      | Sends authenticated REST requests to `/api/v1`                             |
| Guards      | Resolve viewer identity, enforce account status, enforce role requirements |
| Controllers | Stay thin, validate DTOs, pass `OperixViewer` to services                  |
| Services    | Own scope checks, business rules, transactions, Activity, Notifications    |
| Prisma      | Performs typed database reads and writes                                   |
| PostgreSQL  | Stores operational truth and enforces critical constraints                 |

### Core Modules

```text
Auth → Viewer Context → Team Scope
  ↓
Users and Teams
  ↓
Tasks → Submissions → Reviews → Activity
  ↓
Performance and Dashboard Analytics
  ↓
Management Reports
  ↓
Files and Attachments
  ↓
Excel Import / Export
  ↓
Inventory Ledger
```

---

## API Endpoints and Data Flow

All routes are prefixed with:

```text
/api/v1
```

### Health, Auth, and Viewer

| Method | Route                              | Purpose                                             |
| ------ | ---------------------------------- | --------------------------------------------------- |
| `GET`  | `/health`                          | Health check                                        |
| `POST` | Better Auth routes under `/auth/*` | Sign in, sign out, session, and auth provider flows |
| `GET`  | `/viewer/me`                       | Resolve active Operix viewer context                |

### User and Team Management

| Method  | Route                    | Purpose                          |
| ------- | ------------------------ | -------------------------------- |
| `POST`  | `/admins`                | Create Admin account             |
| `GET`   | `/admins`                | List Admins                      |
| `GET`   | `/admins/:adminId`       | Get Admin detail                 |
| `PATCH` | `/admins/:adminId`       | Update Admin                     |
| `POST`  | `/members`               | Create Member account            |
| `GET`   | `/members`               | List Members in authorized scope |
| `GET`   | `/members/:memberId`     | Get Member detail                |
| `PATCH` | `/members/:memberId`     | Update Member                    |
| `POST`  | `/teams`                 | Create Team                      |
| `GET`   | `/teams`                 | List Teams                       |
| `GET`   | `/teams/:teamId`         | Get Team detail                  |
| `PATCH` | `/teams/:teamId`         | Update Team                      |
| `POST`  | `/teams/:teamId/members` | Assign Member to Team            |

### Task, Submission, Review, and Attachments

| Method   | Route                                      | Purpose                          |
| -------- | ------------------------------------------ | -------------------------------- |
| `POST`   | `/tasks`                                   | Create Task                      |
| `GET`    | `/tasks`                                   | List scoped Tasks with filters   |
| `GET`    | `/tasks/:taskId`                           | Get Task detail                  |
| `GET`    | `/tasks/:taskId/history`                   | Get Task status history          |
| `POST`   | `/tasks/:taskId/assignments`               | Assign Task to Member            |
| `POST`   | `/tasks/:taskId/start`                     | Member starts assigned Task      |
| `POST`   | `/tasks/:taskId/submissions`               | Submit or resubmit Task work     |
| `GET`    | `/submissions/:submissionId`               | Get Submission detail            |
| `POST`   | `/submissions/:submissionId/reviews`       | Admin reviews Submission         |
| `POST`   | `/tasks/:taskId/attachments`               | Upload Task attachments          |
| `GET`    | `/tasks/:taskId/attachments`               | List Task attachments            |
| `DELETE` | `/tasks/:taskId/attachments/:attachmentId` | Delete pending Task attachment   |
| `GET`    | `/submissions/:submissionId/attachments`   | List Submission attachments      |
| `GET`    | `/files/:fileId/download`                  | Authorized proxied file download |

### Activity, Notifications, Performance, Dashboard

| Method  | Route                                 | Purpose                            |
| ------- | ------------------------------------- | ---------------------------------- |
| `GET`   | `/activities`                         | Scoped Activity feed               |
| `GET`   | `/notifications`                      | User notification inbox            |
| `GET`   | `/notifications/unread-count`         | Unread notification count          |
| `PATCH` | `/notifications/:notificationId/read` | Mark one notification read         |
| `PATCH` | `/notifications/read-all`             | Mark all notifications read        |
| `GET`   | `/performance/members`                | Member performance metrics         |
| `GET`   | `/performance/members/:memberId`      | Single Member performance          |
| `GET`   | `/performance/teams/:teamId`          | Team performance metrics           |
| `GET`   | `/dashboard/overview`                 | Role aware dashboard overview      |
| `GET`   | `/dashboard/workload`                 | Team and Member workload analytics |
| `GET`   | `/dashboard/trends`                   | UTC zero filled completion trend   |

### Management Reports

| Method  | Route                       | Purpose                                    |
| ------- | --------------------------- | ------------------------------------------ |
| `POST`  | `/reports`                  | Admin creates draft Management Report      |
| `GET`   | `/reports`                  | List scoped Reports                        |
| `GET`   | `/reports/:reportId`        | Get Report detail with versions and review |
| `PATCH` | `/reports/:reportId`        | Update draft or revision required Report   |
| `POST`  | `/reports/:reportId/submit` | Submit immutable Report version            |
| `POST`  | `/reports/:reportId/review` | Super Admin approves or requests revision  |

### Excel Import and Export

| Method | Route                                    | Purpose                                 |
| ------ | ---------------------------------------- | --------------------------------------- |
| `POST` | `/imports/members/preview`               | Preview Member legacy workbook          |
| `POST` | `/imports/members/error-report`          | Generate Member import error workbook   |
| `POST` | `/imports/members`                       | Enrich existing Member designation      |
| `POST` | `/imports/historical-tasks/preview`      | Preview historical Task workbook        |
| `POST` | `/imports/historical-tasks/error-report` | Generate historical Task error workbook |
| `POST` | `/imports/historical-tasks`              | Import terminal historical Tasks        |
| `GET`  | `/exports/tasks`                         | Export Tasks XLSX                       |
| `GET`  | `/exports/performance/members`           | Export Member Performance XLSX          |
| `GET`  | `/exports/performance/teams/:teamId`     | Export Team Performance XLSX            |
| `GET`  | `/exports/dashboard/workload`            | Export Dashboard Workload XLSX          |
| `GET`  | `/exports/dashboard/trends`              | Export Dashboard Trends XLSX            |
| `GET`  | `/exports/management-reports`            | Export Management Reports XLSX          |

### Inventory

| Method  | Route                                          | Purpose                          |
| ------- | ---------------------------------------------- | -------------------------------- |
| `POST`  | `/inventory/categories`                        | Create global Inventory Category |
| `GET`   | `/inventory/categories`                        | List Categories                  |
| `GET`   | `/inventory/categories/:categoryId`            | Get Category detail              |
| `PATCH` | `/inventory/categories/:categoryId`            | Update Category                  |
| `POST`  | `/inventory/items`                             | Create Team scoped Item          |
| `GET`   | `/inventory/items`                             | List Items with stock state      |
| `GET`   | `/inventory/items/:itemId`                     | Get Item detail                  |
| `PATCH` | `/inventory/items/:itemId`                     | Update Item catalog fields       |
| `POST`  | `/inventory/items/:itemId/stock-in`            | Increase stock                   |
| `POST`  | `/inventory/items/:itemId/stock-out`           | Consumable stock out             |
| `POST`  | `/inventory/items/:itemId/adjustments`         | Audited stock correction         |
| `POST`  | `/inventory/items/:itemId/assignments`         | Assign returnable item to Member |
| `GET`   | `/inventory/assignments`                       | List scoped assignments          |
| `GET`   | `/inventory/assignments/:assignmentId`         | Get assignment detail            |
| `POST`  | `/inventory/assignments/:assignmentId/returns` | Partial or full return           |
| `GET`   | `/inventory/transactions`                      | Stock ledger history             |
| `GET`   | `/inventory/summary`                           | Scoped inventory summary         |

### Data Flow

```text
User action
  ↓
Frontend request
  ↓
NestJS route and guards
  ↓
DTO validation
  ↓
Service scope check
  ↓
Prisma query or serializable transaction
  ↓
Activity / Notification when part of business transaction
  ↓
Safe response mapper
  ↓
Frontend state update
```

---

## Key Features

### Workflow and Operations

- **Task lifecycle engine** with assignment, start, submission, review, revision, completion, and cancellation.
- **Submission versioning** that preserves each submitted attempt.
- **Admin submitted Management Reports** with immutable submitted versions and Super Admin review.
- **Inventory V1** with stock movements, returnable assignments, returns, and immutable ledger history.

### Security and Governance

- **Role based access control** for `SUPER_ADMIN`, `ADMIN`, and `MEMBER`.
- **Account status enforcement** for inactive and suspended users.
- **Scope policies** that prevent cross Team data leakage.
- **Privacy safe not found behavior** for scoped resources.

### Analytics and Reporting

- **Dashboard overview, workload, and trends** derived from operational data.
- **Performance metrics** for Members and Teams.
- **Activity feed** for auditable business events.
- **Dynamic XLSX exports** for authorized operational datasets.

### Files and Excel

- **Authenticated file storage** through a provider neutral storage abstraction.
- **Proxied downloads** that never expose storage credentials.
- **Excel migration previews and error reports** for legacy Member and historical Task workbooks.
- **Formula safe spreadsheet output** to protect generated workbooks.

---

## Installation and Local Setup

### Prerequisites

- Node.js `22.12.0` or newer
- pnpm `10.28.0`
- PostgreSQL

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd Operix-Backend
```

### 2. Install dependencies

```bash
pnpm install --frozen-lockfile
```

### 3. Configure environment

```bash
Copy-Item .env.example .env
```

For macOS or Linux:

```bash
cp .env.example .env
```

Fill in at minimum:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/operix
BETTER_AUTH_SECRET=replace_with_a_secure_32_character_secret
BETTER_AUTH_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
FRONTEND_APP_URL=http://localhost:3000
```

### 4. Prepare the database

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
```

Optional initial Super Admin seed:

```bash
pnpm seed:super-admin
```

### 5. Start development server

```bash
pnpm dev
```

The API runs at:

```text
http://localhost:5000/api/v1
```

Swagger runs at:

```text
http://localhost:5000/api/docs
```

when `SWAGGER_ENABLED=true`.

---

## Environment Variables

| Variable                    | Purpose                                | Example                                             |
| --------------------------- | -------------------------------------- | --------------------------------------------------- |
| `NODE_ENV`                  | Runtime mode                           | `development`                                       |
| `PORT`                      | API server port                        | `5000`                                              |
| `DATABASE_URL`              | PostgreSQL connection string           | `postgresql://user:pass@localhost:5432/operix`      |
| `TEST_DATABASE_URL`         | Isolated integration test database     | `postgresql://user:pass@localhost:5432/operix_test` |
| `BETTER_AUTH_SECRET`        | Better Auth secret, 32 plus characters | `replace_with_secure_secret`                        |
| `BETTER_AUTH_URL`           | Backend canonical auth URL             | `http://localhost:5000`                             |
| `FRONTEND_URL`              | Trusted CORS origin                    | `http://localhost:3000`                             |
| `FRONTEND_APP_URL`          | Browser deep link and email URL        | `http://localhost:3000`                             |
| `SWAGGER_ENABLED`           | Enables Swagger docs                   | `true`                                              |
| `SMTP_ENABLED`              | Enables best effort SMTP delivery      | `false`                                             |
| `SMTP_HOST`                 | SMTP host when email is enabled        | `smtp.example.com`                                  |
| `SMTP_PORT`                 | SMTP port                              | `587`                                               |
| `SMTP_SECURE`               | SMTP TLS mode                          | `false`                                             |
| `SMTP_USER`                 | SMTP username                          | `mailer@example.com`                                |
| `SMTP_PASS`                 | SMTP password                          | `********`                                          |
| `SMTP_FROM_EMAIL`           | Sender email                           | `noreply@example.com`                               |
| `SMTP_FROM_NAME`            | Sender display name                    | `Operix`                                            |
| `SEED_SUPER_ADMIN_EMAIL`    | Seed Super Admin email                 | `chief@example.com`                                 |
| `SEED_SUPER_ADMIN_PASSWORD` | Seed Super Admin password              | `ChangeMe123!`                                      |
| `SEED_SUPER_ADMIN_NAME`     | Seed Super Admin name                  | `Chief Admin`                                       |
| `THROTTLE_TTL_MS`           | Rate limit window in milliseconds      | `60000`                                             |
| `THROTTLE_LIMIT`            | Requests per throttle window           | `100`                                               |
| `FILE_STORAGE_ENABLED`      | Enables Cloudinary backed file storage | `false`                                             |
| `CLOUDINARY_CLOUD_NAME`     | Cloudinary cloud name                  | `operix-cloud`                                      |
| `CLOUDINARY_API_KEY`        | Cloudinary API key                     | `1234567890`                                        |
| `CLOUDINARY_API_SECRET`     | Cloudinary API secret                  | `********`                                          |
| `CLOUDINARY_FOLDER`         | Cloudinary folder prefix               | `operix`                                            |

> Keep real `.env` files local. Do not commit runtime secrets.

---

## Folder Structure

```bash
Operix-Backend/
 ┣ context/                  # Architecture, build plan, standards, progress tracker
 ┣ prisma/
 ┃ ┣ migrations/             # Prisma migration history
 ┃ ┗ schema/                 # Multi file Prisma schema
 ┣ resource/
 ┃ ┣ PRD.md                  # Product requirements
 ┃ ┗ excel/                  # Excel mapping and import/export contracts
 ┣ src/
 ┃ ┣ config/                 # Environment validation and resolved configuration
 ┃ ┣ database/               # Prisma module and service
 ┃ ┣ modules/
 ┃ ┃ ┣ auth/                 # Better Auth integration and viewer context
 ┃ ┃ ┣ user-management/      # Admin and Member management
 ┃ ┃ ┣ team/                 # Team and TeamMember ownership
 ┃ ┃ ┣ task/                 # Task lifecycle and attachments
 ┃ ┃ ┣ submission/           # Submissions, reviews, and submission files
 ┃ ┃ ┣ activity/             # Activity feed
 ┃ ┃ ┣ notification/         # Notification inbox
 ┃ ┃ ┣ performance/          # Performance calculators and endpoints
 ┃ ┃ ┣ management-report/    # Admin submitted reports
 ┃ ┃ ┣ dashboard/            # Derived dashboard analytics
 ┃ ┃ ┣ import/               # Excel previews and controlled imports
 ┃ ┃ ┣ export/               # Dynamic XLSX exports
 ┃ ┃ ┣ file/                 # Proxied file downloads
 ┃ ┃ ┗ inventory/            # Stock ledger and returnable assignment module
 ┃ ┣ shared/                 # Cross cutting infrastructure
 ┃ ┣ app.module.ts           # Root Nest module
 ┃ ┗ main.ts                 # Application bootstrap
 ┣ tests/
 ┃ ┣ unit/                   # Unit tests
 ┃ ┣ integration/            # Integration tests
 ┃ ┣ runners/                # Jest runner configs
 ┃ ┗ support/                # Test server and fixtures
 ┣ generated/prisma/         # Generated Prisma client
 ┣ .env.example              # Environment contract
 ┣ package.json              # Scripts and dependencies
 ┗ README.md
```

---

## Development Scripts

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `pnpm dev`              | Start NestJS in watch mode                     |
| `pnpm build`            | Compile the application                        |
| `pnpm start:prod`       | Run compiled production build                  |
| `pnpm typecheck`        | Run TypeScript without emitting                |
| `pnpm lint`             | Run ESLint                                     |
| `pnpm lint:fix`         | Auto fix lint issues                           |
| `pnpm format:check`     | Check Prettier formatting                      |
| `pnpm format`           | Format source and test files                   |
| `pnpm prisma:validate`  | Validate Prisma schema                         |
| `pnpm prisma:generate`  | Generate Prisma client                         |
| `pnpm prisma:migrate`   | Run development migrations                     |
| `pnpm seed:super-admin` | Seed initial Super Admin                       |
| `pnpm test:unit`        | Run unit tests                                 |
| `pnpm test:integration` | Run integration tests with `TEST_DATABASE_URL` |
| `pnpm verify`           | Run the full verification pipeline             |

---

## Quality Gate

Recommended before handing off a backend change:

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:unit
git diff --check
```

Integration tests require a separate test database:

```bash
pnpm test:integration
```

Never run destructive integration tests against a development or production database.

---

## Current Product Scope

### Supported

- Authentication and RBAC
- Admin and Member management
- Teams and Team membership
- Task lifecycle and assignment
- Submission and review workflow
- Task and Submission attachments
- Activity and Notifications
- Performance and Dashboard analytics
- Admin submitted Management Reports
- Excel import previews, error reports, and controlled imports
- Dynamic XLSX exports
- Inventory V1

### Deferred

- Realtime transport
- CSV and PDF exports
- Stored or scheduled exports
- Management Report attachments
- Inventory attachments
- Inventory Excel import/export
- Warehouse, procurement, valuation, batch, expiry, serial number, barcode
- Automatic task assignment
- Production deployment hardening

---

## License

This repository is currently marked as:

```text
ArnabSaga
```

Update the license before publishing as open source.

---

<div align="center">

**Operix**
_A workflow first backend for operational clarity, auditability, and data driven decisions._

</div>
