# Step 17E — Member Data Import Contract

Status: Complete after implementation and quality gate.

Step 17E is the second controlled Excel to Operix business write. It imports only existing Member account enrichment from the approved `MEMBER_LEGACY_V1` profile.

It does not create accounts, provision Better Auth users, change identity fields, change Team membership, change roles or statuses, send Notifications or SMTP email, add ImportBatch infrastructure, change Prisma schema, or run migrations.

## Endpoint

```http
POST /api/v1/imports/members
```

Authorization:

```text
SUPER_ADMIN only
```

The endpoint accepts exactly one `.xlsx` file and reruns the full Step 17C analysis. A previous preview is never trusted for execution.

## Field ownership

Assertion and context fields:

```text
employeeId
email
teamId
```

Ignored field:

```text
name
```

Writable field:

```text
designation
```

The writer must construct an explicit Prisma update object:

```ts
data: {
  designation: targetDesignation,
}
```

Do not build a dynamic write object from profile fields.

## Preview and analysis semantics

Identity can resolve by:

```text
employeeId
email
employeeId + email
```

Never resolve by name.

Nonblank source identity fields are assertions:

```text
source employeeId
→ must equal resolved User.employeeId

source email
→ must equal resolved User.email
```

Team is validation context only:

```text
source teamId
→ must exist
→ must equal current TeamMember.teamId
```

Final row dispositions:

```text
designation blank
→ ALREADY_PRESENT

designation same as current normalized value
→ ALREADY_PRESENT

designation different and valid
→ CANDIDATE_UPDATE

identity missing or unresolved
→ INVALID

identity mismatch
→ CONFLICT

Team missing or membership mismatch
→ CONFLICT
```

Valid `MEMBER_LEGACY_V1` analysis has:

```text
candidateRows = 0
```

## Duplicate rule

Duplicate detection happens after identity resolution.

Rows are grouped by resolved `User.id`.

More than one source row targeting the same Member is blocking:

```text
DUPLICATE_SOURCE_MEMBER
```

No first row wins or last row wins behavior is allowed.

## Transaction algorithm

```text
full workbook analysis
        ↓
INVALID / CONFLICT?
        ├─ yes → 409 IMPORT_EXECUTION_BLOCKED, zero writes
        ↓
unexpected CANDIDATE?
        ├─ yes → IMPORT_VERIFICATION_FAILED
        ↓
candidateUpdateRows = 0?
        ├─ yes → 200 no-op, no Activity
        ↓
SERIALIZABLE transaction
        ↓
bulk re-read Users + TeamMemberships by resolved User.id
        ↓
validate:
  user still exists
  role still MEMBER
  employeeId assertion still matches
  email assertion still matches
  Team membership still matches
        ↓
designation classification:
  current == target → no-op
  current == baseline → update
  current is third value → CONCURRENT_MODIFICATION
        ↓
apply designation-only updates
        ↓
verify protected fields and designation
        ↓
if updatedRows > 0:
  MEMBERS_IMPORTED Activity
        ↓
COMMIT
```

Status changes among:

```text
ACTIVE
INACTIVE
SUSPENDED
```

do not block execution while role remains `MEMBER`.

## Activity

One batch Activity is written inside the same transaction only when actual Members are updated:

```text
action = MEMBERS_IMPORTED
entityType = IMPORT
entityId = null
```

Metadata contains safe aggregate counts and the mapping profile only. It must not include names, emails, employee IDs, Member IDs, designation values, raw rows, or workbook text.

If every candidate update is already at the target designation during the transaction, execution returns success with `updatedRows = 0` and writes no Activity.

## Mutation boundary

Step 17E may write only:

```text
User.designation
ActivityLog
```

Step 17E may read:

```text
User
Team
TeamMember
```

Step 17E must not write:

```text
User.name
User.email
User.employeeId
User.role
User.status
Team
TeamMember
Account
Session
Task
TaskAssignment
TaskStatusHistory
Notification
FileAsset
```
