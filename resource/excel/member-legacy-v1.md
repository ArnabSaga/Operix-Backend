# MEMBER_LEGACY_V1 Mapping Profile

Status: Approved sanitized V1 profile for Step 17B / 17C preview implementation

This profile previews existing Member account enrichment only. It creates no accounts and performs no database writes.

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
designation
teamId
status-like metadata if approved
```

## Source column mapping

| Source column | Example | Operix target | Required | Rule | Status |
| --- | --- | --- | --- | --- | --- |
| Employee ID | EMP-001 | `User.employeeId` | Conditional identity | exact trimmed match against existing Member | APPROVED |
| Email | member@example.com | `User.email` | Conditional identity | lowercase trimmed match against existing Member | APPROVED |
| Team ID | team-a | `TeamMember.teamId` | Yes | explicit Operix `teamId`; no Team name fuzzy matching | APPROVED |
| Name | Member A | none | No | ignored for identity; may appear in diagnostics only | APPROVED_IGNORED |
| Designation | Officer | `User.designation` | No | candidate update only; no write in Step 17C | APPROVED |

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
```

These labels now feed Step 17C row diagnostics.

## Preview dispositions

```text
existing Member + all import owned fields match
→ ALREADY_PRESENT

existing Member + designation differs
→ CANDIDATE_UPDATE

existing Member + Team differs
→ CONFLICT

unresolved Member
→ INVALID
```
