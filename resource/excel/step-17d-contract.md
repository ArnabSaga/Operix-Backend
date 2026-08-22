# Step 17D — Historical Task Import Contract

Status: Complete after final correctness hardening.

Step 17D is the first controlled Excel to Operix business write. It imports only terminal historical Task records from the approved `HISTORICAL_TASK_LEGACY_V1` profile.

It does not implement Member import, Excel exports, active Task cutover, submissions, reviews, notifications, SMTP, `ImportBatch`, Prisma schema changes, or migrations.

## Endpoint

```http
POST /api/v1/imports/historical-tasks
```

Authorization:

```text
SUPER_ADMIN only
```

The endpoint accepts exactly one `.xlsx` file and reruns the full Step 17C analysis. A previous preview is never trusted for execution.

## Canonical identity

```text
source Task Reference
→ HISTORICAL_TASK_LEGACY_V1 normalization only
→ Task.referenceCode
```

The resulting canonical `referenceCode` is persisted unchanged and is the rerun identity key.

Do not generate replacement references, lowercase, case-fold, or otherwise transform references beyond the approved profile normalization.

## Executable terminal state rules

Both terminal states require:

```text
createdAt
assignedAt
```

`COMPLETED` requires:

```text
completedAt != null
cancelledAt = null
```

`CANCELLED` requires:

```text
cancelledAt != null
completedAt = null
```

Optional timestamps:

```text
startedAt
dueAt
```

Optional timestamps are never fabricated.

Dates compare by canonical instant, not by Excel display text.

## Transaction rechecks

Execution uses one Serializable transaction for candidate rows.

Inside the transaction, Operix re-reads stable identities:

```text
Task.referenceCode
Team.id
assignee User.id
creator User.id
assigner User.id
```

Required current invariants:

```text
Team id still exists
assignee id still exists
assignee role is MEMBER
creator id still exists
assigner id still exists
```

Historical assignee status may be:

```text
ACTIVE
INACTIVE
SUSPENDED
```

Team names and User display names do not participate in execution rechecks.

## Idempotency comparison

`ALREADY_PRESENT` and transaction-time `CONCURRENT_ALREADY_PRESENT` compare all import-owned canonical fields:

```text
referenceCode
title
description
remarks
priority
status
teamId
createdById
memberId
assignedById
createdAt
assignedAt
startedAt
dueAt
completedAt
cancelledAt
```

Date equality means the same instant.

## Transaction algorithm

```text
full workbook analysis
        ↓
INVALID / CONFLICT?
        ├─ yes → 409 IMPORT_EXECUTION_BLOCKED, zero writes
        ↓
SERIALIZABLE transaction
        ↓
re-read Tasks by canonical referenceCode
re-read Teams by teamId
re-read assignees / creators / assigners by userId
        ↓
validate current invariants
        ↓
classify each candidate:
  ABSENT → INSERT
  EXISTS + canonical exact match → CONCURRENT_ALREADY_PRESENT
  EXISTS + import-owned mismatch → CONFLICT
        ↓
any conflict?
        ├─ yes → rollback all
        ↓
create Tasks
create TaskAssignments
create import-marker TaskStatusHistory
        ↓
verify counts, relationships, and values
        ↓
if importedRows > 0:
  write one HISTORICAL_TASKS_IMPORTED Activity
        ↓
COMMIT
```

Verification invariant:

```text
tasksCreated = assignmentsCreated = historyRowsCreated = importedRows
```

If verification fails:

```text
IMPORT_VERIFICATION_FAILED
→ rollback
```

## Created rows

For every imported row, Operix creates:

```text
Task
TaskAssignment
TaskStatusHistory
```

The `Task` is a terminal snapshot using source canonical values.

The `TaskAssignment` uses the source `assignedAt` and keeps:

```text
unassignedAt = null
```

This current assignment relationship is intentional for V1 because Member performance attribution uses current `TaskAssignment`. It does not mean the historical terminal Task is operationally active.

The `TaskStatusHistory` marker uses:

```text
fromStatus = null
toStatus = imported final status
changedById = importing SUPER_ADMIN
changedAt = import execution time
```

`changedAt` means “Operix recorded this historical terminal state now.” It is not `completedAt` or `cancelledAt`, and it does not claim the exact historical workflow transition happened at import time.

## Activity

One batch Activity is written inside the same transaction only when actual Tasks are created:

```text
action = HISTORICAL_TASKS_IMPORTED
entityType = IMPORT
entityId = null
```

Metadata contains safe aggregate counts and the mapping profile only. It must not include raw rows, task titles, descriptions, remarks, employee IDs, emails, or file contents.

If every candidate becomes already present during the transaction, execution returns success with `importedRows = 0` and writes no Activity.

## Explicit non-goals

Step 17D must not create or mutate:

```text
User
Team
TeamMember
TaskSubmission
TaskReview
Notification
FileAsset
Account
Session
```

It also must not send SMTP email or invoke normal live Task workflow services.
