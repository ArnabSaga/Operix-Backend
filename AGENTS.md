# Operix — AI / Developer Instructions

This repository is **Operix**, a Pharmaceutical Workload & Operations Management Platform.

This file is the mandatory entry point for any AI coding agent or developer working on the project.

## 1. Read Order

Before making architectural or implementation decisions, read in this exact order:

1. `resource/PRD.md`
2. `context/project-overview.md`
3. `context/architecture.md`
4. `context/ui-tokens.md`
5. `context/ui-rules.md`
6. `context/ui-registry.md`
7. `context/code-standards.md`
8. `context/library-docs.md`
9. `context/build-plan.md`
10. `context/progress-tracker.md`

Do not begin implementation from memory when the repository already documents the decision.

## 2. Source of Truth

Priority order when instructions conflict:

1. Current explicit user/client instruction
2. `resource/PRD.md`
3. `context/architecture.md`
4. Relevant context file
5. Existing implementation
6. Library defaults

Never silently replace an unresolved product rule with a convenient engineering assumption.

## 3. Canonical Product Identity

**Product Name:** Operix  
**Full Title:** Pharmaceutical Workload & Operations Management Platform  
**Primary Goal:** Replace Excel-based operational workload tracking with a centralized workflow-driven system.

Permanent product principle:

```text
Work → Activity → Data → Analytics → Decision
```

## 4. Canonical Roles

Use only these backend authorization roles:

```text
SUPER_ADMIN
ADMIN
MEMBER
```

Business/UI labels:

```text
SUPER_ADMIN → Chief / Super Admin
ADMIN       → Admin
MEMBER      → Member / Staff
```

Do not introduce separate `CHIEF`, `STAFF`, `EMPLOYEE`, or similar role enums unless the PRD changes.

## 5. Canonical Task State Machine

Use the V1 baseline:

```text
PENDING
  ↓
ASSIGNED
  ↓
IN_PROGRESS
  ↓
SUBMITTED
  ↓
UNDER_REVIEW
  ├──→ COMPLETED
  └──→ REVISION_REQUIRED
          ↓
      RESUBMITTED
          ↓
      UNDER_REVIEW
```

Exceptional terminal state:

```text
CANCELLED
```

`OVERDUE` is initially a derived operational condition:

```text
dueAt < now
AND status NOT IN (COMPLETED, CANCELLED)
```

Do not expose arbitrary task status mutation. Prefer explicit actions such as assign, start, submit, review, cancel.

## 6. Canonical Backend Flow

```text
Route / Module → Controller → Service → Prisma → PostgreSQL
```

Rules:

- Controllers stay thin.
- Services own business logic, authorization scope, state transitions, transactions, and persistence decisions.
- Backend authorization is mandatory.
- Feature modules should not directly depend on another feature controller.
- Prefer neutral shared infrastructure for audit writing, storage, pagination, errors, and auth context.

## 7. Core Product Hierarchy

```text
SUPER_ADMIN
    ↓
ADMIN
    ↓
MEMBER
```

Default V1 assumption:

- one Member has one primary responsible Admin;
- one Admin can manage many Members;
- Super Admin has organization-wide visibility.

Multiple-Admin Member relationships remain unresolved and must not be invented silently.

## 8. Reporting Model

Operix has two distinct report concepts.

### A. System-Generated Reports

Generated from database data:

- workload;
- performance;
- overdue;
- completion;
- Admin activity;
- operational summaries.

### B. Admin-Submitted Management Reports

Prepared by Admin and submitted to Super Admin.

Do not merge these into one ambiguous feature.

## 9. Inventory Rule

Inventory is **conditional**.

The client used the word inventory, but the operational workflow is primarily workload/task based.

Do not build advanced:

- procurement;
- suppliers;
- purchase orders;
- batch/lot;
- serial tracking;
- valuation;
- warehouse accounting;

unless the PRD is updated after client confirmation.

## 10. Real-Time Rule

Real-time is for important events only.

Potential events:

- task assignment;
- submission;
- resubmission;
- review outcome;
- notification;
- activity feed;
- dashboard counters.

REST remains the default for normal CRUD.

Real-time delivery failure must not corrupt or roll back an already-successful core database transaction.

## 11. Excel Replacement Rule

The application database becomes the operational source of truth.

Excel is used for:

- migration;
- import;
- export;
- reporting;

not as a parallel operational database after rollout.

## 12. Testing

Use a centralized test structure:

```text
tests/
├── unit/
├── integration/
│   └── modules/
├── support/
│   ├── database/
│   ├── fixtures/
│   ├── auth/
│   └── server/
└── runners/
```

Rules:

- `tests/` may import `src/`.
- `src/` must never import tests.
- Use `TEST_DATABASE_URL`.
- Never run destructive database tests against non-test databases.
- Prefer deterministic fixtures and exact cleanup.
- Authorization isolation tests are mandatory.

## 13. Context Maintenance

After every meaningful feature:

- update `context/progress-tracker.md`;
- update `context/ui-registry.md` when reusable UI changes;
- update `context/library-docs.md` when dependencies change;
- update `context/architecture.md` when architecture decisions become canonical;
- update `resource/PRD.md` only for genuine product requirement changes.

## 14. Verification

Typical final verification:

```bash
pnpm lint
pnpm test
pnpm test:integration
pnpm tsc --noEmit
pnpm prisma validate
pnpm build
git diff --check
```

Only claim checks that actually passed.

## 15. Git Safety

The user manages Git history unless explicitly asking the agent to do so.

Do not:

- force-push;
- rewrite history;
- delete branches;
- perform destructive Git operations;

without explicit instruction.

## 16. Implementation Principle

Prefer the smallest correct implementation that preserves:

- role isolation;
- task workflow integrity;
- auditability;
- maintainability;
- data correctness;
- performance visibility;
- future extensibility.

Do not add deferred features because they seem useful.
