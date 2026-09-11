# Operix Team and Global Task API

This document records the coordinated Task API contract for Team classification, Global classification, in app distribution, and attachment access.

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

## Coordinated Release

The frontend must migrate with this backend because `team` is now nullable, Task responses add `scope` and `distribution`, and file responses replace `uploadedById` with `uploadedBy`.
