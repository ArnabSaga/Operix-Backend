# Operix Team and Global Task API

This document records the coordinated Task API contract for Team classification, Global classification, in app distribution, attachment access, and opt in Member self claim.

## Create a Task

```http
POST /api/v1/tasks
```

TEAM is the default scope and requires `teamId`. Admin creation remains limited to a Team currently administered by that Admin.

```json
{
  "title": "Prepare monthly operations report",
  "scope": "TEAM",
  "teamId": "<team-public-uuid>"
}
```

Only a Super Admin may create a GLOBAL Task. GLOBAL has no Team and always uses DIRECT completion. A one time GLOBAL Task may be unassigned.

```json
{
  "title": "Organization policy acknowledgement",
  "scope": "GLOBAL",
  "distribution": {
    "notifyAll": true
  }
}
```

For a scheduled one time broadcast, supply only `scheduledAt`.

```json
{
  "title": "Planned maintenance notice",
  "scope": "GLOBAL",
  "distribution": {
    "notifyAll": true,
    "scheduledAt": "2026-09-15T09:00:00+06:00"
  }
}
```

A recurring GLOBAL Task requires `dueAt`, `responsibleUserId`, and a distribution `leadMinutes` value from 0 through 10080. `scheduledAt` is not accepted for recurring distribution.

```json
{
  "title": "Publish organization status",
  "scope": "GLOBAL",
  "dueAt": "2026-09-25T17:00:00+06:00",
  "responsibleUserId": "<user-public-uuid>",
  "recurrence": {
    "frequency": "MONTHLY"
  },
  "distribution": {
    "notifyAll": true,
    "leadMinutes": 1440
  }
}
```

## Task Execution Authority

Only the current Responsible User may start a Task.

A DIRECT Task in `IN_PROGRESS` with a current active assignment may be completed by:

```text
Current Responsible User
Super Admin administrative override
Current Team Admin administrative override for TEAM Tasks
```

Team Admin override does not apply to GLOBAL Tasks. Administrative completion records the actual actor in history and Activity, but it does not transfer or modify Task responsibility.

## Recurring Task Contract

Recurring Tasks use the first `dueAt` value as their calendar anchor. The submitted Task is the first occurrence; the frontend never creates later occurrences.

For a TEAM Task that repeats monthly on the fifth at 9:00 AM in the Operix business timezone:

```json
{
  "title": "Submit Bank Balance",
  "scope": "TEAM",
  "teamId": "<team-public-uuid>",
  "responsibleUserId": "<user-public-uuid>",
  "dueAt": "2026-10-05T09:00:00+06:00",
  "recurrence": {
    "frequency": "MONTHLY",
    "reminderLeadMinutes": 1440
  }
}
```

The server owns the resulting schedule:

```text
Initial occurrence  → 5 Oct 2026, 09:00
Next occurrence     → 5 Nov 2026, 09:00
Following occurrence → 5 Dec 2026, 09:00
```

For a GLOBAL recurrence with both Responsible User reminder and organization broadcast timing:

```json
{
  "title": "Monthly Financial Submission",
  "scope": "GLOBAL",
  "responsibleUserId": "<user-public-uuid>",
  "dueAt": "2026-10-05T09:00:00+06:00",
  "recurrence": {
    "frequency": "MONTHLY",
    "reminderLeadMinutes": 1440
  },
  "distribution": {
    "notifyAll": true,
    "leadMinutes": 720
  }
}
```

```text
Responsible reminder   → 4 Oct 2026, 09:00
Organization broadcast → 4 Oct 2026, 21:00
Task due               → 5 Oct 2026, 09:00
```

Canonical Task responses embed this recurrence summary:

```ts
recurrence: {
  id: string;
  frequency: "WEEKLY" | "MONTHLY";
  nextOccurrenceAt: string;
  reminderLeadMinutes: number;
  distributionLeadMinutes: number | null;
  isActive: boolean;
} | null;
```

`nextOccurrenceAt` is the next scheduled Task occurrence that has not yet been materialized. It is not a reminder, broadcast, or cron timestamp.

`distributionLeadMinutes` has these exact meanings:

```text
null      → recurring organization broadcast disabled
0         → broadcast at the occurrence due time
1..10080  → broadcast that many minutes before the occurrence is due
```

The dedicated recurrence resource uses the same six common fields as the embedded summary:

```http
GET /api/v1/task-recurrences/:recurrenceId
GET /api/v1/task-recurrences/:recurrenceId/occurrences
PATCH /api/v1/task-recurrences/:recurrenceId
```

PATCH changes future series defaults only. Existing Tasks, reminders, and distributions remain unchanged. Setting `distributionLeadMinutes` to `null` disables broadcasts on future occurrences. Pausing stops future generation; resuming selects the next future anchor without backfilling intentionally paused periods. Older overdue occurrences do not block later cycles.

The backend remains authoritative for `nextOccurrenceAt`, occurrence keys, month-end clamping, pause/resume behavior, and Task generation. Clients may display a preview but must not create future Tasks or expose cron-expression terminology.

## Read and Filter

Task responses include `scope`, nullable `team`, and nullable `distribution`.

```ts
{
  scope: "TEAM" | "GLOBAL";
  team: { id: string; name: string } | null;
  distribution: {
    status: "PENDING" | "SENT" | "CANCELLED";
    scheduledAt: string;
    sentAt: string | null;
  } | null;
}
```

Use `GET /api/v1/tasks?scope=GLOBAL` or `GET /api/v1/tasks?scope=TEAM`. `scope=GLOBAL` with `teamId` returns `400 VALIDATION_ERROR`. A `teamId` without scope is treated as TEAM filtering.

## Manage a Pending Distribution

The Task Owner or a Super Admin may reschedule or cancel a PENDING distribution.

```http
PATCH /api/v1/tasks/:taskId/distribution
Content-Type: application/json

{
  "scheduledAt": "2026-09-15T08:30:00+06:00"
}
```

```http
POST /api/v1/tasks/:taskId/distribution/cancel
```

SENT and CANCELLED distributions are immutable. Cancelling one recurring occurrence does not disable distribution on future occurrences.

## Attachment Contract

Task attachment upload requires a Super Admin, the Owner Admin, or the current Responsible Member. Task attachment deletion requires a Super Admin, the Owner Admin, or the current Responsible Member deleting an attachment they personally uploaded. Mutation is allowed only while PENDING or ASSIGNED and not started. A SENT GLOBAL distribution locks Owner Admin and Super Admin mutation, but the current Responsible Member may still upload and delete only their own uploads until execution starts. This exception is GLOBAL only and does not apply to TEAM Tasks.

GLOBAL Task attachments are readable by every active authenticated role. TEAM Task and submission attachment authorization remain unchanged.

Frontend attachment controls should use the same authority and editability split:

```ts
const hasAttachmentUploadAuthority =
  viewer.role === "SUPER_ADMIN" ||
  (viewer.role === "ADMIN" && viewer.id === task.owner.id) ||
  (viewer.role === "MEMBER" && viewer.id === task.responsible?.id);

const hasAttachmentDeleteAuthority =
  viewer.role === "SUPER_ADMIN" ||
  (viewer.role === "ADMIN" && viewer.id === task.owner.id) ||
  (
    viewer.role === "MEMBER" &&
    viewer.id === task.responsible?.id &&
    viewer.id === attachment.uploadedBy.id
  );

const lifecycleEditable =
  task.status === "PENDING" ||
  (task.status === "ASSIGNED" && task.startedAt === null);

const sentGlobalDistribution =
  task.scope === "GLOBAL" && task.distribution?.status === "SENT";

const distributionAllowsUpload =
  !sentGlobalDistribution ||
  (viewer.role === "MEMBER" && viewer.id === task.responsible?.id);

const distributionAllowsDelete =
  !sentGlobalDistribution ||
  (
    viewer.role === "MEMBER" &&
    viewer.id === task.responsible?.id &&
    viewer.id === attachment.uploadedBy.id
  );

const canUploadTaskAttachments =
  hasAttachmentUploadAuthority && lifecycleEditable && distributionAllowsUpload;

const canDeleteTaskAttachment =
  hasAttachmentDeleteAuthority && lifecycleEditable && distributionAllowsDelete;
```

Responsible Member mutation is limited to the current Responsible User during the pre execution edit window. Members may delete only attachments they uploaded. Owner Admins and Super Admins may delete any TaskAttachment on an eligible Task, except after a GLOBAL distribution has been sent. DIRECT completion evidence remains a separate future artifact concept.

Attachment responses expose:

```ts
uploadedBy: {
  id: string;
  name: string;
}
```

The uploader ID is a public User UUID. Private User IDs and Cloudinary storage identifiers are never returned.

The upload validator canonicalizes `image/jpg` to `image/jpeg` and still requires JPEG binary content. DOCX, XLSX, and PPTX files declared as `application/zip` or `application/octet-stream` are accepted only when binary package inspection identifies the matching OOXML subtype and the filename extension agrees. Generic ZIP files and renamed Office packages are rejected.

## Member Self Claim

Task creation accepts `allowSelfClaim`, which defaults to `false`. Enabling it requires a one time Task without an initial Responsible User. Recurring Tasks cannot enable self claim.

The Task Owner or a Super Admin may enable or disable self claim while the Task is PENDING, unassigned, and non recurring:

```http
PATCH /api/v1/tasks/:taskId/self-claim
Content-Type: application/json

{
  "enabled": true
}
```

An active Member may claim an eligible Task, including a TEAM Task outside the Member's Team:

```http
POST /api/v1/tasks/:taskId/claim
```

The claim creates the normal responsibility and status history, returns the canonical Task with the claimant as `responsible`, and sends the assignment email after commit. Exactly one concurrent claimant succeeds. Other concurrent claim attempts receive `409 TASK_CLAIM_CONFLICT` without winner information.

Self claim notifies the claimant and Task Owner only. It never triggers GLOBAL distribution fan out.

Task responses expose:

```ts
allowSelfClaim: boolean;
```

The client derives claimability from:

```ts
viewer.role === "MEMBER" &&
task.allowSelfClaim === true &&
task.status === "PENDING" &&
task.responsible === null &&
task.recurrence === null;
```

The backend always revalidates these conditions.

## Frontend Error Guide

| Result                              | Meaning                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `403` upload                        | Viewer is not a Super Admin, Owner Admin, or current Responsible Member |
| `403` delete                        | Viewer lacks Task authority, or a Responsible Member is deleting somebody else's upload |
| `409 TASK_ATTACHMENTS_NOT_EDITABLE` | Task execution or a sent broadcast locked attachments |
| `503 FILE_STORAGE_UNAVAILABLE`      | Backend storage is disabled or unavailable            |
| `400 FILE_TYPE_NOT_ALLOWED`         | MIME, filename extension, or binary validation failed |
| `413 FILE_TOO_LARGE`                | File exceeds the configured maximum                   |
| `409 TASK_CLAIM_CONFLICT`           | Another Member claimed the Task first                 |

Frontend Task contracts must replace `teamId`, `createdById`, `assignedMemberId`, Task assignment `memberId`, and `uploadedById` with `scope` plus `team`, `owner`, `responsible`, `responsibleUserId`, and `uploadedBy`. General assignment requests send `responsibleUserId`.

## Recurrence Frontend Handoff

Use product language in Task creation and detail views:

```text
Repeat
Does not repeat
Weekly
Monthly
First due date
Reminder before due
Broadcast before due
Next scheduled Task occurrence
```

When recurrence is enabled, require a future first due date and a Responsible User, use DIRECT completion, and hide or disable Member self claim. GLOBAL recurrence may optionally configure an organization broadcast lead separately from the Responsible User reminder lead.

Recurring reminder configuration is nested under `recurrence`:

```ts
recurrence: {
  frequency,
  reminderLeadMinutes,
}
```

Do not send a root-level `reminderLeadMinutes` field.

The frontend may preview text such as `Repeats monthly on the 5th at 9:00 AM`, but it must never generate or persist later occurrences. It reads `nextOccurrenceAt` from the backend, uses the recurrence APIs for pause, resume, future-series edits, and occurrence history, and treats each occurrence as a normal Task. Do not expose cron, cron expressions, RRULE, or scheduler rule terminology.

## Coordinated Release

The recurrence summary addition is backward compatible, so the backend may deploy before a frontend that starts using `distributionLeadMinutes`. The wider Task contract still uses nullable `team`, `scope`, `distribution`, `allowSelfClaim`, `responsibleUserId`, and `uploadedBy` as documented above.
