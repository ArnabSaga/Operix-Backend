# MEMBER_LEGACY_V1 Mapping Profile

Status: Approved sanitized V1 profile for Step 17E existing Member enrichment execution

This profile previews and executes existing Member account enrichment only. It creates no accounts and writes only `User.designation` plus one safe batch Activity when actual rows are updated.

## Recognition fingerprint

```text
Workbook structure:
Required sheets: Members
Optional sheets: none
Header row: 1
Header order: ANY_ORDER
Normalized header set: employee id, email, team id, name, designation
Required columns: Employee ID, Email, Team ID
Optional columns: Name, Designation
Known lookup sheets: none
Blocking structural issues: missing or duplicate required columns, semantic header collisions
```

The profile must be recognized by structure, not filename.

## Dataset classification

Expected classification:

```text
MEMBER_LEVEL_IMPORTABLE
```

If the workbook only contains aggregate staff counts or summary metrics, classify the sheet as:

```text
AGGREGATE_REPORTING_ONLY
```

and do not use it to mutate Member records.

## Identity resolution

Allowed identity fields:

```text
employeeId
email
```

Forbidden identity field:

```text
name
```

Rules:

```text
employeeId → User A
email      → User A
→ valid

employeeId → User A
email      → User B
→ blocking conflict

name only
→ MEMBER_NOT_RESOLVED
```

Historical, inactive, and suspended Members must be catalogued separately from current operational assignability.

## New account creation

Deferred.

Excel import must not bypass Better Auth, and workbooks must not contain plaintext initial passwords just to make bulk onboarding easy.

## Team mapping

Do not resolve Team by first matching `Team.name`.

Legacy Team values must be classified as:

```text
EXACT_CURRENT_TEAM
APPROVED_LEGACY_TO_CURRENT_MAPPING
AMBIGUOUS
NO_CURRENT_EQUIVALENT
```

No automatic Team creation.

## Import owned canonical fields

`ALREADY_PRESENT` must compare only fields controlled by this profile, not unrelated Operix fields.

```text
employeeId
email
teamId
designation
```

Assertion and context fields:

```text
employeeId
email
teamId
```

Writable fields:

```text
designation
```

The writer must update `designation` explicitly. Do not use this field list to build a dynamic update object.

## Source column mapping

| Source column | Example | Operix target | Required | Rule | Status |
| --- | --- | --- | --- | --- | --- |
| Employee ID | EMP-001 | `User.employeeId` | Conditional identity | exact trimmed match against existing Member | APPROVED |
| Email | member@example.com | `User.email` | Conditional identity | lowercase trimmed match against existing Member | APPROVED |
| Team ID | team-a | `TeamMember.teamId` | Yes | explicit Operix `teamId`; no Team name fuzzy matching | APPROVED |
| Name | Member A | none | No | ignored for identity, matching, duplicate detection, and updates | APPROVED_IGNORED |
| Designation | Officer | `User.designation` | No | only writable field; trimmed, max 120; blank preserves current value | APPROVED |

## Validation issues to catalog

```text
MISSING_REQUIRED_COLUMN
DUPLICATE_REQUIRED_COLUMN
MEMBER_NOT_RESOLVED
EMPLOYEE_EMAIL_CONFLICT
AMBIGUOUS_TEAM
NO_CURRENT_TEAM_EQUIVALENT
UNKNOWN_STATUS_VALUE
INVALID_EMAIL
DUPLICATE_SOURCE_MEMBER
MEMBER_IDENTITY_CONFLICT
MEMBER_DESIGNATION_INVALID
```

These labels now feed Step 17C row diagnostics.

## Preview dispositions

```text
existing Member + all import owned fields match
→ ALREADY_PRESENT

existing Member + blank designation
→ ALREADY_PRESENT

existing Member + designation differs and is valid
→ CANDIDATE_UPDATE

existing Member + employeeId differs
→ CONFLICT

existing Member + email differs
→ CONFLICT

existing Member + Team differs
→ CONFLICT

unresolved Member
→ INVALID

duplicate resolved Member
→ INVALID
```

For this profile:

```text
candidateRows = 0
```

Rows are grouped by resolved `User.id` after identity resolution. Duplicate source rows targeting the same Member block the workbook even if their designations are identical.

## Step 17E execution semantics

```http
POST /api/v1/imports/members
```

Execution reruns the full Step 17C analysis and never trusts a previous preview.

Rows with:

```text
INVALID
CONFLICT
```

block execution with:

```text
409 IMPORT_EXECUTION_BLOCKED
```

and zero business writes.

Candidate update rows are written in one serializable transaction. The transaction rechecks:

```text
User.id still exists
User.role still MEMBER
employeeId assertion still matches
email assertion still matches
TeamMember.teamId still matches
```

Status changes among `ACTIVE`, `INACTIVE`, and `SUSPENDED` do not block while role remains `MEMBER`.

Designation concurrency:

```text
current == target
→ no op

current == baseline
→ update designation

current is a third value
→ rollback
→ CONCURRENT_MODIFICATION
```

Only this Prisma update shape is allowed:

```ts
data: {
  designation: targetDesignation,
}
```

Execution writes one batch Activity only when actual rows are updated:

```text
MEMBERS_IMPORTED
```

Execution does not create:

```text
Better Auth account
User email update
User employeeId update
User name update
User role update
User status update
TeamMember update
Notification
SMTP email
```
