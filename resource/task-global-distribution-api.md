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

Task attachment upload and deletion require the Task Owner or a Super Admin. Mutation is allowed only while PENDING or ASSIGNED and not started. A SENT GLOBAL distribution locks attachment mutation.

GLOBAL Task attachments are readable by every active authenticated role. TEAM Task and submission attachment authorization remain unchanged.

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

The client derives claimability from an active Member viewer, `allowSelfClaim=true`, `status=PENDING`, and `responsible=null`. The backend always revalidates these conditions.

## Frontend Error Guide

| Result | Meaning |
| --- | --- |
| `403` upload | Viewer is not the Task Owner or a Super Admin |
| `409 TASK_ATTACHMENTS_NOT_EDITABLE` | Task execution or a sent broadcast locked attachments |
| `503 FILE_STORAGE_UNAVAILABLE` | Backend storage is disabled or unavailable |
| `400 FILE_TYPE_NOT_ALLOWED` | MIME, filename extension, or binary validation failed |
| `413 FILE_TOO_LARGE` | File exceeds the configured maximum |
| `409 TASK_CLAIM_CONFLICT` | Another Member claimed the Task first |

Frontend Task contracts must replace `teamId`, `createdById`, `assignedMemberId`, Task assignment `memberId`, and `uploadedById` with `scope` plus `team`, `owner`, `responsible`, `responsibleUserId`, and `uploadedBy`. General assignment requests send `responsibleUserId`.

## Coordinated Release

The frontend must migrate with this backend because `team` is nullable, Task responses include `scope`, `distribution`, and `allowSelfClaim`, assignment uses `responsibleUserId`, and file responses use `uploadedBy`.
