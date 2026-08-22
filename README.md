<div align="center">

# 🏥 Operix — Pharmaceutical Workload & Operations Management Platform

### _Enterprise Backend API for Workflow Automation, Role Isolation, Auditability & Operational Analytics_

[![Node.js](https://img.shields.io/badge/Node.js-v22.12+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-v11.0.1-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict_v5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma_ORM-v7.9.1-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Better Auth](https://img.shields.io/badge/Better_Auth-v1.6.29-000000?style=for-the-badge&logo=auth0&logoColor=white)](https://better-auth.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

[**Live Demo API**](http://localhost:5000/api/v1/health) • [**Swagger API Docs**](http://localhost:5000/api/docs) • [**Architecture Specs**](./context/architecture.md) • [**Progress Tracker**](./context/progress-tracker.md)

<!-- ---

</div>

## 🖼️ Project Preview & Architecture

```text
                  ┌──────────────────────────────────────────────────────────┐
                  │                 Operix Enterprise Backend                │
                  └────────────────────────────┬─────────────────────────────┘
                                               │
       ┌───────────────────────┬───────────────┴───────────────┬───────────────────────┐
       ▼                       ▼                               ▼                       ▼
 🔐 Better Auth        ⚡ State Machine                📊 Analytics Engine     📦 Inventory Ledger
Session & Roles      Task Lifecycle Engine           Performance & Workload    Stock & Equipment
 (SUPER_ADMIN,       PENDING → ASSIGNED →             `completionRate`         STOCK_IN/OUT/ADJUST
  ADMIN, MEMBER)     SUBMITTED → COMPLETED           `onTimeRate`              Assignment Checkout
```

<div align="center">

![Operix Architecture Overview](./public/preview.png)
_Figure 1: High-level architectural data flow across Security, Workflow Engine, Analytics, and Audit Subsystems._

![Operix Dashboard Analytics](./public/dashboard-preview.png)
_Figure 2: Real-time operational dashboard analytics preview demonstrating workload distribution and completion trends._

</div>

--- -->

## 📌 Project Overview

**Operix** is a domain-driven, production-grade enterprise backend designed to transform fragmented, Excel-based pharmaceutical operational tracking into a centralized, audit-verifiable workflow management system.

In high-compliance pharmaceutical operations, tracking staff workloads, batch reconciliations, and review cycles using disconnected spreadsheets leads to missing audit trails, unverified completion states, and operational bottlenecks. **Operix** enforces strict role isolation, immutable state transitions, and real-time analytical visibility over every operational task.

### Permanent Core Principle

$$\text{Work} \longrightarrow \text{Activity} \longrightarrow \text{Data} \longrightarrow \text{Analytics} \longrightarrow \text{Decision}$$

- **Target Industry:** Pharmaceutical Workload & Operations Management
- **Primary Objective:** Replace manual Excel logs with automated state-machine workflows
- **Security Paradigm:** Session-based authentication with strict role-based access control (RBAC)
- **Data Integrity Guarantee:** Atomic transactions with DB-level check constraints and partial unique indexes

---

## 💎 Core Value & Engineering Highlights

What makes **Operix** significantly more robust than generic CRUD platforms:

1. **Deterministic Task State Machine:** Enforces valid status transitions (`PENDING` $\to$ `ASSIGNED` $\to$ `IN_PROGRESS` $\to$ `SUBMITTED` $\to$ `UNDER_REVIEW` $\to$ `COMPLETED`). Invalid or out-of-order state mutations are strictly rejected.
2. **Multi-Version Submissions & Review History:** When work is returned for revision (`REVISION_REQUIRED`), submitted content is saved in versioned snapshots (`v1, v2...`), ensuring prior work is never overwritten.
3. **Database-Engine Enforced Active Assignments:** Utilizes PostgreSQL partial unique indexes (`WHERE "unassignedAt" IS NULL`) to guarantee that a task has at most _one active assignee_ at any microsecond.
4. **Optimistic Concurrency & Retry-Enabled Serializable Transactions:** Critical multi-table operations execute within `executeSerializableTransaction` loops, automatically retrying upon PostgreSQL serialization conflicts (`40001`).
5. **Isolated Excel Migration Engine:** Import and Export subsystems run on SheetJS Community Edition with formula-injection sanitization guards and magic-byte content validation (`file-type`).
6. **Non-Corrupting Side Effects:** Real-time event notifications and SMTP emails execute _after_ the core database transaction commits. Real-time or transport failures will never corrupt or roll back a successful database transaction.

---

## 🛠️ Technology Stack

| Domain                   | Technology                           | Description / Decision Rationale                                                                |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Runtime & Core**       | **Node.js v22.12+** + **NestJS v11** | Modern ESM-first execution environment paired with NestJS dependency injection architecture.    |
| **Language**             | **TypeScript v5.7**                  | Strict type checking (`noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`).       |
| **Database**             | **PostgreSQL v16+**                  | Relational data store supporting check constraints, partial indexes, and JSONB metadata.        |
| **ORM**                  | **Prisma v7.9.1**                    | Multi-file schema partitioning (`prisma/schema/*.prisma`) with `@prisma/adapter-pg` driver.     |
| **Authentication**       | **Better Auth v1.6.29**              | Session-based authentication engine, password hashing, and cookie session management.           |
| **File Storage**         | **Cloudinary** / **Local Disk**      | Dual-mode file storage adapter with magic-byte verification (`file-type`) and size validation.  |
| **Email Delivery**       | **Nodemailer v9**                    | Best-effort post-transaction SMTP email dispatching with responsive HTML templates.             |
| **Spreadsheet Engine**   | **SheetJS (xlsx v0.20.3)**           | Multi-format reader/writer (`.xlsx`, `.csv`, `.tsv`, `.ods`) with formula injection protection. |
| **Security & Utilities** | **Helmet** + **Throttler**           | Security headers, CORS origin enforcement, and 100 req/min rate limiting.                       |

---

## 📐 System Architecture & Request Lifecycle

```text
 Client Request (HTTP / REST)
          │
          ▼
   ┌──────────────┐
   │ Helmet Guard │  ➔ Security headers & CORS validation
   └──────┬───────┘
          │
          ▼
┌──────────────────┐
│ Throttler Guard  │  ➔ Rate limiting (100 req / min)
└─────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │ Auth Middleware │  ➔ Better Auth session token verification
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │  App Guards     │  ➔ ViewerContextGuard (Scope), AccountStatusGuard, OperixRoleGuard (RBAC)
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │   Controllers   │  ➔ DTO Validation (class-validator) & Payload Mapping
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │    Services     │  ➔ Business logic, State Machine transitions, Serializable Transactions
 └────────┬────────┘
          │
          ▼
 ┌─────────────────┐
 │   Prisma ORM    │  ➔ `@prisma/adapter-pg` ➔ PostgreSQL Database
 └────────┬────────┘
          │
          ├───────────────────────────────────────────┐
          ▼                                           ▼
 ┌─────────────────┐                        ┌──────────────────┐
 │ Activity Logger │ ➔ AuditLog DB Entry    │  Nodemailer SMTP │ ➔ Post-commit Email Dispatch
 └─────────────────┘                        └──────────────────┘
```

### Canonical Roles & Scoping

- **`SUPER_ADMIN` (Chief / Organization Admin):** Organization-wide visibility across all teams, members, tasks, audit logs, and management reports.
- **`ADMIN` (Team Admin / Operational Manager):** Scoped visibility restricted to members and tasks within their assigned/managed teams (`teamId IN viewer.scope.teamIds`).
- **`MEMBER` (Staff Executer):** Restricted to viewing assigned tasks, submitting work revisions, viewing own notifications, and checking personal performance analytics.

---

## 📡 API Endpoints & Data Flow

All API routes are prefixed with `/api/v1`.

### 1. Authentication & Viewer Context

| Method | Route                        | Description                                            | Access Control |
| ------ | ---------------------------- | ------------------------------------------------------ | -------------- |
| `POST` | `/api/v1/auth/sign-in/email` | Authenticate user with credentials & establish session | Public         |
| `POST` | `/api/v1/auth/sign-out`      | Terminate active user session                          | Authenticated  |
| `GET`  | `/api/v1/auth/me`            | Fetch active session & viewer context payload          | Authenticated  |

### 2. User & Team Management

| Method | Route                             | Description                         | Access Control         |
| ------ | --------------------------------- | ----------------------------------- | ---------------------- |
| `POST` | `/api/v1/admins`                  | Provision new `ADMIN` account       | `SUPER_ADMIN`          |
| `GET`  | `/api/v1/admins`                  | List all `ADMIN` accounts           | `SUPER_ADMIN`          |
| `POST` | `/api/v1/members`                 | Provision new `MEMBER` account      | `SUPER_ADMIN`, `ADMIN` |
| `GET`  | `/api/v1/members`                 | List `MEMBER` accounts within scope | Scoped                 |
| `POST` | `/api/v1/teams`                   | Create new operational team         | `SUPER_ADMIN`          |
| `GET`  | `/api/v1/teams`                   | List operational teams              | Scoped                 |
| `POST` | `/api/v1/teams/:id/assign-member` | Assign or transfer Member to team   | `SUPER_ADMIN`, `ADMIN` |

### 3. Task Management & Workflow State Machine

| Method | Route                       | Description                                                           | Access Control         |
| ------ | --------------------------- | --------------------------------------------------------------------- | ---------------------- |
| `POST` | `/api/v1/tasks`             | Create task with auto-generated reference code (`TSK-YYYYMMDD-XXXX`)  | `SUPER_ADMIN`, `ADMIN` |
| `GET`  | `/api/v1/tasks`             | List tasks with filters (`status`, `priority`, `search`, `isOverdue`) | Scoped                 |
| `GET`  | `/api/v1/tasks/:id`         | Get task detail payload with calculated `isOverdue` flag              | Scoped                 |
| `POST` | `/api/v1/tasks/:id/assign`  | Assign/reassign task to Member (logs `TaskAssignment`)                | `SUPER_ADMIN`, `ADMIN` |
| `POST` | `/api/v1/tasks/:id/start`   | Transition status `ASSIGNED` $\to$ `IN_PROGRESS`                      | Assigned Member        |
| `POST` | `/api/v1/tasks/:id/cancel`  | Cancel task (`CANCELLED`)                                             | `SUPER_ADMIN`, `ADMIN` |
| `GET`  | `/api/v1/tasks/:id/history` | Paginated task status change timeline (`TaskStatusHistory`)           | Scoped                 |

### 4. Submissions & Administrative Reviews

| Method | Route                               | Description                                                         | Access Control         |
| ------ | ----------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| `POST` | `/api/v1/tasks/:taskId/submissions` | Submit task work (`SUBMITTED`/`RESUBMITTED`), version `v1, v2...`   | Assigned Member        |
| `GET`  | `/api/v1/submissions/:id`           | Get submission detail with file attachments & review history        | Scoped                 |
| `POST` | `/api/v1/submissions/:id/reviews`   | Review submission (`APPROVE` $\to$ `COMPLETED`, `REQUEST_REVISION`) | `SUPER_ADMIN`, `ADMIN` |

### 5. Analytics, Reports & Operations

| Method | Route                         | Description                                                      | Access Control          |
| ------ | ----------------------------- | ---------------------------------------------------------------- | ----------------------- |
| `GET`  | `/api/v1/dashboard/summary`   | Real-time operational dashboard counters                         | Scoped                  |
| `GET`  | `/api/v1/dashboard/workload`  | Team and member workload balance metrics                         | Scoped                  |
| `GET`  | `/api/v1/dashboard/trends`    | Time-series task completion trend analytics                      | Scoped                  |
| `GET`  | `/api/v1/performance/members` | Operational performance metrics (`completionRate`, `onTimeRate`) | Scoped                  |
| `POST` | `/api/v1/management-reports`  | Create & submit Admin management reports to Super Admin          | `ADMIN` / `SUPER_ADMIN` |
| `GET`  | `/api/v1/inventory/items`     | Operational tool & equipment stock ledger                        | Scoped                  |
| `GET`  | `/api/v1/exports/tasks`       | Export task dataset (`xlsx`, `csv`, `tsv`, `ods`)                | Scoped                  |
| `POST` | `/api/v1/imports/inspect`     | Dry-run inspect legacy Excel workbooks                           | `SUPER_ADMIN`, `ADMIN`  |

### Standard Error Response Shape

All errors return a predictable JSON payload:

```json
{
  "success": false,
  "message": "Task already has an active assignment.",
  "code": "TASK_ALREADY_ASSIGNED",
  "details": null
}
```

---

## ✨ Key Platform Features

### 🛡️ Security & Role Isolation

- **Session-Based Better Auth:** Secure HttpOnly session tokens with password hashing via Argon2/Bcrypt.
- **Strict Account Status Enforcement:** Suspended or inactive accounts are blocked instantly by `AccountStatusGuard`.

### 🔄 Deterministic Task Engine

- **Atomic State Transitions:** Guards state order and records every change in `TaskStatusHistory`.
- **Derived Overdue Flag:** Calculates `isOverdue` dynamically (`dueAt < now AND status NOT IN ('COMPLETED', 'CANCELLED')`) without duplicating database state.

### 📝 Multi-Version Submissions

- **Immutable Revision Snapshots:** Preserves historical submissions (`v1`, `v2`, `v3`) and feedback notes when revision is required.

### 📊 Performance Analytics Engine

- **Calculated Metrics:** Dynamic calculation of `completionRate`, `onTimeRate`, `revisionRate`, `averageCompletionMinutes`, and `overallScore`.

### 📈 Multi-Format Spreadsheet Engine

- **SheetJS Integration:** Import legacy workbooks (`member-legacy-v1`, `historical-task-legacy-v1`) with row-level error reports, and export datasets in `.xlsx`, `.csv`, `.tsv`, and `.ods`.

### 📦 Operational Inventory Ledger

- **Stock Movement & Equipment Assignment:** Track stock movements (`STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`) and assignable equipment checkout/return cycles.

---

## 💻 Installation & Local Setup

### Prerequisites

- **Node.js:** `v22.12.0` or newer
- **Package Manager:** `pnpm v10.28.0`
- **Database:** `PostgreSQL v16+`

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/ArnabSaga/Operix-Backend.git
cd Operix-Backend
pnpm install --frozen-lockfile
```

### 2. Environment Configuration

Copy the environment template:

```bash
# POSIX (Linux/macOS)
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` to configure your PostgreSQL connection and auth secrets:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/operix?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/operix_test?schema=public
BETTER_AUTH_SECRET=a_very_secret_32_character_minimum_key_string
BETTER_AUTH_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
FRONTEND_APP_URL=http://localhost:3000
```

### 3. Database Migration & Seed

Generate the Prisma Client and run database migrations:

```bash
# Validate schema files
pnpm prisma:validate

# Generate Prisma Client (outputs to src/generated/prisma)
pnpm prisma:generate

# Seed the initial Super Admin account
pnpm seed:super-admin
```

### 4. Run Development Server

```bash
pnpm dev
```

The server will start at `http://localhost:5000/api/v1`. Swagger docs will be accessible at `http://localhost:5000/api/docs`.

---

## ⚙️ Environment Variables

| Variable                   | Requirement  | Default                 | Purpose                                                       |
| -------------------------- | ------------ | ----------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                 | **Required** | `development`           | Runtime environment (`development`, `test`, `production`)     |
| `PORT`                     | Optional     | `5000`                  | HTTP server port                                              |
| `DATABASE_URL`             | **Required** | —                       | PostgreSQL connection string                                  |
| `TEST_DATABASE_URL`        | Test Only    | —                       | Isolated PostgreSQL database connection for integration tests |
| `BETTER_AUTH_SECRET`       | **Required** | —                       | Better Auth secret key (minimum 32 characters)                |
| `BETTER_AUTH_URL`          | **Required** | `http://localhost:5000` | Backend canonical URL for auth callbacks                      |
| `FRONTEND_URL`             | **Required** | `http://localhost:3000` | CORS allowed origin(s)                                        |
| `FRONTEND_APP_URL`         | **Required** | `http://localhost:3000` | Canonical frontend app URL for email links                    |
| `SWAGGER_ENABLED`          | Optional     | `true`                  | Enables Swagger API documentation at `/api/docs`              |
| `THROTTLE_TTL_MS`          | Optional     | `60000`                 | Rate limiter window in milliseconds                           |
| `THROTTLE_LIMIT`           | Optional     | `100`                   | Maximum requests per throttle window                          |
| `SMTP_ENABLED`             | Optional     | `false`                 | Enables best-effort SMTP email delivery                       |
| `SMTP_HOST`                | Conditional  | —                       | Required if `SMTP_ENABLED=true`                               |
| `SMTP_PORT`                | Conditional  | —                       | Required if `SMTP_ENABLED=true`                               |
| `FILE_STORAGE_ENABLED`     | Optional     | `false`                 | Enables Cloudinary file storage backend                       |
| `CLOUDINARY_CLOUD_NAME`    | Conditional  | —                       | Required if `FILE_STORAGE_ENABLED=true`                       |
| `EXCEL_MAX_FILE_BYTES`     | Optional     | `10485760`              | Maximum spreadsheet upload file size (10 MB)                  |
| `EXCEL_MAX_WORKSHEET_ROWS` | Optional     | `10000`                 | Maximum allowed worksheet row limit                           |

---

## 📁 Repository Directory Structure

```bash
Operix-Backend/
 ┣ 📂 context/                     # Project architecture, guidelines, and progress trackers
 ┣ 📂 prisma/
 ┃ ┣ 📂 migrations/                # Database migration history
 ┃ ┗ 📂 schema/                    # Multi-file partitioned Prisma schemas
 ┃   ┣ 📜 schema.prisma            # Datasource & generator config
 ┃   ┣ 📜 enums.prisma             # Domain enums (UserRole, TaskStatus, etc.)
 ┃   ┣ 📜 auth.prisma              # Better Auth identity models
 ┃   ┣ 📜 organization.prisma      # Team & TeamMember models
 ┃   ┣ 📜 task.prisma              # Task, Assignment, & History models
 ┃   ┣ 📜 submission.prisma        # TaskSubmissions & TaskReviews
 ┃   ┣ 📜 file.prisma              # FileAssets & Attachment joins
 ┃   ┣ 📜 activity.prisma          # ActivityLog audit model
 ┃   ┣ 📜 notification.prisma      # In-App Notification model
 ┃   ┣ 📜 performance.prisma       # PerformanceRecord snapshot model
 ┃   ┣ 📜 report.prisma            # ManagementReport & Version models
 ┃   ┗ 📜 inventory.prisma         # Inventory categories, items, & transactions
 ┣ 📂 resource/                    # PRD documentation & Excel import profile specs
 ┣ 📂 src/
 ┃ ┣ 📂 config/                    # Environment validation & NestJS config loader
 ┃ ┣ 📂 database/                  # PrismaModule & PrismaService provider
 ┃ ┣ 📂 generated/prisma           # Generated Prisma Client code
 ┃ ┣ 📂 modules/                   # Feature modules
 ┃ ┃ ┣ 📂 auth/                    # Better Auth module & Super Admin seeder
 ┃ ┃ ┣ 📂 user-management/         # Admin & Member provisioning APIs
 ┃ ┃ ┣ 📂 team/                    # Team creation & assignment APIs
 ┃ ┃ ┣ 📂 task/                    # Task lifecycle & state machine APIs
 ┃ ┃ ┣ 📂 submission/              # Submissions & Review APIs
 ┃ ┃ ┣ 📂 file/                    # File upload & asset management APIs
 ┃ ┃ ┣ 📂 notification/            # In-App Notification APIs
 ┃ ┃ ┣ 📂 activity/                # System Audit Activity Log APIs
 ┃ ┃ ┣ 📂 performance/             # Member performance metrics engine
 ┃ ┃ ┣ 📂 management-report/      # Admin-submitted management reports
 ┃ ┃ ┣ 📂 dashboard/               # Scoped operational dashboards
 ┃ ┃ ┣ 📂 import/                  # Excel migration engine & profile registry
 ┃ ┃ ┣ 📂 export/                  # Multi-format dataset export APIs
 ┃ ┃ ┗ 📂 inventory/               # Inventory ledger & tool assignment APIs
 ┃ ┣ 📂 shared/                    # Neutral cross-cutting infrastructure
 ┃ ┃ ┣ 📂 activity/                # Async ActivityLog writer service
 ┃ ┃ ┣ 📂 auth/                    # ViewerContext, RBAC Guards, & Scope helpers
 ┃ ┃ ┣ 📂 database/                # TransactionClient & serializable retry runner
 ┃ ┃ ┣ 📂 errors/                  # AppException & AppErrorCode constants
 ┃ ┃ ┣ 📂 file-storage/            # Storage abstraction & Cloudinary adapter
 ┃ ┃ ┣ 📂 mail/                    # Nodemailer SMTP service & templates
 ┃ ┃ ┣ 📂 notification/            # Notification writer service
 ┃ ┃ ┣ 📂 pagination/              # Pagination DTO & meta helpers
 ┃ ┃ ┗ 📂 spreadsheet/             # SheetJS adapter & formula injection guard
 ┃ ┣ 📜 app.module.ts              # NestJS root application container
 ┃ ┗ 📜 main.ts                    # NestJS bootstrap entrypoint
 ┣ 📂 tests/                       # Unit & E2E Integration test suites
 ┃ ┣ 📂 integration/               # Multi-module E2E PostgreSQL integration tests
 ┃ ┣ 📂 runners/                   # Jest configuration runners (unit & integration)
 ┃ ┣ 📂 support/                   # Test application factories & server harnesses
 ┃ ┗ 📂 unit/                      # Unit test suites across services, guards, & math engines
 ┣ 📜 .env.example                 # Environment variables schema template
 ┣ 📜 nest-cli.json                # NestJS CLI configuration
 ┣ 📜 package.json                 # Project dependencies & npm scripts
 ┣ 📜 prisma.config.ts             # Prisma 7 CLI configuration
 ┗ 📜 tsconfig.json                # Strict TypeScript configuration
```

---

## 🧪 Verification & Development Scripts

```bash
# Development & Compilation
pnpm dev              # Start NestJS server in watch mode
pnpm build            # Compile TypeScript application bundle into dist/
pnpm typecheck        # Run tsc type checking without emitting files

# Code Quality & Format
pnpm lint             # Run ESLint check across src/ and tests/
pnpm lint:fix         # Fix auto-fixable ESLint issues
pnpm format:check    # Verify formatting via Prettier
pnpm format           # Auto-format all code files via Prettier

# Database & Prisma
pnpm prisma:validate  # Validate Prisma multi-file schema
pnpm prisma:generate  # Generate Prisma Client to src/generated/prisma
pnpm prisma:migrate   # Apply dev database migrations
pnpm seed:super-admin # Seed initial trusted Super Admin account

# Testing Suite
pnpm test:unit        # Run unit tests (Jest ESM runner)
pnpm test:integration # Run integration tests (Requires TEST_DATABASE_URL)
pnpm verify           # Complete CI quality suite verification
```

---

<div align="center">

### 🏛️ **Operix Engineering Standard**

_Built with strict type safety, role isolation, deterministic workflows, and high-performance database design._

Made with ❤️ for Enterprise Pharmaceutical Operations Management.

</div>
