# HISTORICAL_TASK_LEGACY_V1 Mapping Profile

Status: Approved sanitized V1 profile for Step 17D historical Task import execution

This profile previews and executes terminal historical Task candidates only. Preview and error report remain read only. Execution writes only historical terminal Task snapshots, assignments, status history markers, and one safe batch Activity when rows are created.

## Recognition fingerprint

```text
Workbook structure:
Required sheets: Tasks
Optional sheets: none
Header row: 1
Header order: ANY_ORDER
Normalized header set: task reference, title, status, team id, member employee id, created by email, assigned by email, description, remarks, priority, created at, assigned at, started at, due at, completed at, cancelled at
Required columns: Task Reference, Title, Status, Team ID, Member Employee ID, Created By Email, Assigned By Email
Execution required values: Created At, Assigned At, plus terminal-state timestamp requirements
Optional columns: Description, Remarks, Priority, Created At, Assigned At, Started At, Due At, Completed At, Cancelled At
Known lookup sheets: none
Blocking structural issues: missing or duplicate required columns, semantic header collisions
```

The profile must be recognized by structure, not filename.

## Dataset classification

Historical Task import requires task level records.

Valid:

```text
one source row
→ one identifiable historical Task candidate
```

Invalid for Task creation:

```text
Employee | Month | Completed | Pending
```

That is aggregate reporting data. It must be classified as:

```text
AGGREGATE_REPORTING_ONLY
```

Do not manufacture synthetic Tasks from aggregate counts.

## Historical Task identity

Preferred identity order:

```text
Task Reference
→ Task.referenceCode
```

The source Task Reference uses only the normalization approved by this profile. The resulting canonical `referenceCode` is persisted unchanged and is the rerun identity key. Do not generate replacement references, lowercase, case-fold, or otherwise transform the source reference beyond profile normalization.

Row number helps error reporting, but it is not durable identity because rows can move between workbook versions.

Do not invent composite deduplication rules unless analysis proves the combination is actually unique.

## Initial import status boundary

The first historical migration profile should support terminal records only:

```text
COMPLETED
CANCELLED
```

Active task cutover requires a separate decision.

## Operational workflow boundary

Historical migration must not call normal live workflow services such as:

```text
TaskService.createTask()
TaskService.assignTask()
SubmissionService.createSubmission()
ReviewService.createReview()
```

Historical import must not send:

```text
TASK_ASSIGNED email
Task assignment Notification
submission Notification
review Notification
```

Historical dates must be preserved where available. Missing dates remain missing.

Executable terminal timestamp rules:

```text
COMPLETED
→ completedAt required
→ cancelledAt must be null

CANCELLED
→ cancelledAt required
→ completedAt must be null

Both
→ createdAt required
→ assignedAt required

startedAt
dueAt
→ optional
→ never fabricated
```

## Chronology discovery

Do not silently repair chronology problems in legacy data.

Catalog actual timestamp combinations, then decide future validation rules. Potential checks may include:

```text
createdAt <= assignedAt
assignedAt <= startedAt
startedAt <= completedAt

dueAt before completedAt
→ valid late completion

CANCELLED
→ cancelledAt required and completedAt null

COMPLETED
→ completedAt required and cancelledAt null
```

If legacy data violates modern workflow chronology, document the pattern. Do not silently repair it.

## Member attribution

Historical ownership and current assignability are different.

Catalog cases where the historical assignee is:

```text
ACTIVE
INACTIVE
SUSPENDED
missing from Operix
ambiguous
```

Do not automatically require `ACTIVE` for historical attribution.

## Team attribution

Classify every legacy Team value as:

```text
EXACT_CURRENT_TEAM
APPROVED_LEGACY_TO_CURRENT_MAPPING
AMBIGUOUS
NO_CURRENT_EQUIVALENT
```

Do not force historical data into the nearest modern Team.

## Import owned canonical fields

`ALREADY_PRESENT` must compare only fields controlled by this profile.

```text
referenceCode
title
description
remarks
priority
status
teamId
createdBy
assignee
assignedBy
createdAt
assignedAt
startedAt
dueAt
completedAt
cancelledAt
```

Date comparison uses canonical instants, not Excel display strings.

## Source column mapping

| Source column | Example | Operix target | Required | Rule | Status |
| --- | --- | --- | --- | --- | --- |
| Task Reference | TASK-001 | `Task.referenceCode` | Yes | stable source identity; exact trimmed match | APPROVED |
| Title | Batch reconciliation | `Task.title` | Yes | trimmed non empty | APPROVED |
| Status | COMPLETED | `Task.status` | Yes | only `COMPLETED` or `CANCELLED` | APPROVED |
| Team ID | team-a | `Task.teamId` | Yes | explicit Operix `teamId`; no Team name fuzzy matching | APPROVED |
| Member Employee ID | EMP-001 | historical assignee | Yes | exact `User.employeeId` for existing Member; inactive/suspended may resolve | APPROVED |
| Created By Email | admin@example.com | historical creator | Yes | exact existing User email | APPROVED |
| Assigned By Email | admin@example.com | historical assigner | Yes | exact existing User email | APPROVED |
| Description | Details | `Task.description` | No | trimmed optional | APPROVED |
| Remarks | Notes | `Task.remarks` | No | trimmed optional | APPROVED |
| Priority | HIGH | `Task.priority` | No | `LOW`, `MEDIUM`, `HIGH`, `URGENT`; blank defaults to `MEDIUM` | APPROVED |
| Created At | 2026-08-01T10:00:00Z | `Task.createdAt` | Yes for execution | valid date; no fabrication | APPROVED |
| Assigned At | 2026-08-01T11:00:00Z | historical assignment timestamp | Yes for execution | valid date; no fabrication | APPROVED |
| Started At | 2026-08-01T12:00:00Z | `Task.startedAt` | No | valid date if supplied; no fabrication | APPROVED |
| Due At | 2026-08-10T18:00:00Z | `Task.dueAt` | No | valid date if supplied; may be before completedAt | APPROVED |
| Completed At | 2026-08-12T18:00:00Z | `Task.completedAt` | Conditional | required when status is `COMPLETED`; must be blank when status is `CANCELLED` | APPROVED |
| Cancelled At | 2026-08-12T18:00:00Z | `Task.cancelledAt` | Conditional | required when status is `CANCELLED`; must be blank when status is `COMPLETED` | APPROVED |

## Reconciliation discovery

If source data permits it, identify future reconciliation checks:

```text
source completed Task count
vs imported completed Task count

source totals by Member
vs Operix totals by Member

source totals by Team
vs Operix totals by Team
```

Imported historical Tasks immediately affect ALL_TIME performance, dashboard totals, Team metrics, and Member metrics. Reconciliation must make that impact intentional.

## Step 17D execution semantics

```text
POST /api/v1/imports/historical-tasks
```

Execution reruns the full Step 17C analysis and never trusts a previous preview.

Blocking rows:

```text
INVALID
CONFLICT
```

return:

```text
409 IMPORT_EXECUTION_BLOCKED
```

with bounded preview style diagnostics and zero business writes.

Rows already present:

```text
ALREADY_PRESENT
```

create no duplicate Tasks. If every considered row is already present or ignored, execution returns success with `importedRows = 0` and creates no Activity.

Candidate rows are written in one serializable transaction. The transaction rechecks existing Tasks by canonical `referenceCode`, Teams by `teamId`, assignees by `userId` and `role = MEMBER`, creators by `userId`, and assigners by `userId`. Inactive and suspended historical assignees remain valid. Team names and User display names do not affect transaction rechecks.

```text
candidate still absent
→ create historical terminal Task
→ create one current TaskAssignment
→ create one TaskStatusHistory marker

candidate now identical
→ no op

candidate now different
→ rollback
→ IMPORT_EXECUTION_BLOCKED
```

Created historical terminal Tasks keep a current assignment relationship:

```text
TaskAssignment.unassignedAt = null
```

This is intentional because Operix V1 performance attribution uses the current `TaskAssignment` relation. It does not mean the imported terminal Task is operationally active.

The history marker is intentionally honest:

```text
fromStatus = null
toStatus = imported final status
changedAt = import execution time
notes = historical import, intermediate legacy transitions not reconstructed
```

`changedAt` means Operix recorded the historical terminal state during import. It must not be replaced with `completedAt` or `cancelledAt`.

Verification before commit enforces:

```text
tasksCreated = assignmentsCreated = historyRowsCreated = importedRows
```

Execution does not create:

```text
TaskSubmission
TaskReview
Notification
SMTP email
```
