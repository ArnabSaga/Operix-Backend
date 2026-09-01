# OPERIX — Master Product Requirements Document

**Product Name:** Operix
**Product Title:** Pharmaceutical Workload & Operations Management Platform
**Product Type:** Internal Enterprise Workload, Task, Performance, Reporting & Operational Management System
**Industry:** Pharmaceutical / Medical Company
**Version:** 1.0
**Document Status:** Master PRD / Product Definition / Development Baseline
**Primary Objective:** Replace Excel-based operational workload tracking with a centralized, workflow-driven digital platform.

---

# Document Control

| Field                           | Value                                         |
| ------------------------------- | --------------------------------------------- |
| Product                         | Operix                                        |
| Version                         | 1.0                                           |
| Status                          | Development Baseline                          |
| Primary Roles                   | Super Admin / Chief, Admin, Member / Staff    |
| Primary Platform                | Responsive Web Application                    |
| Data Source of Truth            | Central Application Database                  |
| Existing Process Being Replaced | Excel-based workload and operational tracking |

---

# 1. Executive Product Definition

**Operix** is an internal enterprise operations platform designed for pharmaceutical and medical organizations to manage:

- organizational workload;
- task creation and assignment;
- task execution;
- submission and review;
- staff performance;
- Admin activity;
- operational reporting;
- workload distribution;
- notifications;
- activity history;
- management analytics;
- real-time operational visibility.

The platform replaces fragmented Excel-based operational tracking with a structured digital workflow.

The fundamental product flow is:

```text
Work
  ↓
Activity
  ↓
Structured Data
  ↓
Analytics
  ↓
Decision
```

Operix is **not simply an Excel replacement, task CRUD system, inventory application, or dashboard**.

It is a workflow-driven operational management platform where every meaningful work action generates structured information that management can use for:

- monitoring;
- reporting;
- performance measurement;
- workload balancing;
- operational decision-making.

---

# 2. Business Background

The organization currently relies heavily on Excel-based tracking for operational workload and reporting.

This creates several problems:

- information is fragmented across spreadsheets;
- updates are manual;
- calculations are manual;
- task status is difficult to monitor;
- historical activity is difficult to trace;
- management has limited real-time visibility;
- workload imbalance is difficult to identify;
- Admin activity is difficult to monitor;
- staff performance requires manual calculation;
- reports require repeated manual preparation;
- overdue work may not be immediately visible;
- the organization has no centralized operational activity history.

Operix will convert this process into a centralized digital workflow.

---

# 3. Current vs Future Workflow

## Existing Process

```text
Excel
   ↓
Manual Updates
   ↓
Manual Tracking
   ↓
Manual Calculations
   ↓
Manual Reports
   ↓
Chief Review
```

## Operix Process

```text
Operix
   ↓
Create & Assign Work
   ↓
Members Execute
   ↓
Members Submit
   ↓
Admin Reviews
   ↓
Activity Automatically Recorded
   ↓
Central Database
   ↓
Performance + Reports + Notifications
   ↓
Analytics
   ↓
Management Dashboard
   ↓
Decision
```

The central database becomes the organization's operational source of truth.

Excel becomes an import/export format rather than the primary operational system.

---

# 4. Product Vision

Operix should allow management to answer questions such as:

- What work is currently active?
- Who is responsible for each task?
- Which tasks are overdue?
- What is waiting for review?
- Which Members currently have too much work?
- Which Members have available capacity?
- Which Members consistently complete work on time?
- Which work is repeatedly rejected or corrected?
- Which Admins have high or low team workload?
- How much work was completed this week or month?
- How is individual performance changing?
- How is organizational workload changing?
- What important activities happened today?
- Which reports are waiting for management review?
- Which areas require immediate attention?

The Chief should not need to collect multiple spreadsheets before understanding the current operational situation.

---

# 5. Product Goals

Operix must:

1. Replace Excel as the primary workload tracking system.
2. Centralize organizational work.
3. Create a structured task workflow.
4. Provide backend-enforced role-based access control.
5. Allow Admins to assign work.
6. Allow Members to execute and submit assigned work.
7. Allow Admins to review submitted work.
8. Preserve task and review history.
9. Track important activity automatically.
10. Measure staff performance using real operational data.
11. Make workload imbalance visible.
12. Support performance-informed work allocation.
13. Provide dynamic dashboards.
14. Provide operational reports.
15. Provide management-level analytics.
16. Identify overdue and pending work immediately.
17. Support real-time updates for important events.
18. Preserve historical operational data.
19. Support Excel export.
20. Support PDF reports where required.
21. Support future expansion without redesigning the core workflow.

---

# 6. Product Terminology

To prevent inconsistent implementation, Operix uses the following canonical system roles.

| System Role   | Business/UI Label   |
| ------------- | ------------------- |
| `SUPER_ADMIN` | Chief / Super Admin |
| `ADMIN`       | Admin               |
| `MEMBER`      | Member / Staff      |

Backend implementation must use the canonical enum values:

```text
SUPER_ADMIN
ADMIN
MEMBER
```

Terms such as `CHIEF`, `STAFF`, or `EMPLOYEE` should not be introduced as separate authorization roles unless the product requirements change.

---

# 7. User Hierarchy

```text
SUPER_ADMIN / CHIEF
        │
        ├──────── ADMIN A
        │            ├── MEMBER 1
        │            ├── MEMBER 2
        │            └── MEMBER 3
        │
        ├──────── ADMIN B
        │            ├── MEMBER 4
        │            └── MEMBER 5
        │
        └──────── ADMIN C
                     ├── MEMBER 6
                     └── MEMBER 7
```

Default V1 assumption:

- one Member has one primary responsible Admin;
- an Admin can manage multiple Members;
- Super Admin has organization-wide visibility.

Multiple-Admin Member relationships remain a **pending business decision**.

---

# 8. Role — Super Admin / Chief

The Super Admin is the highest-level management user.

The Super Admin can:

- view and manage Admin accounts;
- view Members;
- create Members where permitted by organization policy;
- assign or transfer Members to Admins;
- view organization-wide tasks;
- view task assignments;
- view task submissions;
- view task review history;
- view task lifecycle history;
- view Admin activity;
- view Member activity;
- view organization-wide workload;
- view Admin/team workload;
- view Member performance;
- view Admin/team performance;
- view reports;
- review Admin-submitted reports;
- view analytics;
- monitor overdue work;
- monitor task completion;
- monitor workload imbalance;
- view important operational alerts;
- view activity history;
- access system-level settings where applicable;
- export reports/data where permitted.

The Super Admin should obtain the organization's operational overview without manually collecting Excel sheets.

---

# 9. Role — Admin

Admins manage Members and workload within their permitted organizational scope.

An Admin can:

- view Members under their responsibility;
- view Member profile information;
- view Member workload;
- view Member task history;
- view Member performance;
- create tasks;
- assign tasks;
- reassign tasks where permitted;
- set task priority;
- set task deadline;
- provide task instructions;
- monitor task progress;
- review submitted work;
- approve submitted work;
- request correction/revision;
- reject work if the final business workflow requires rejection;
- add feedback;
- provide quality ratings where required;
- monitor overdue tasks;
- identify workload imbalance;
- create management reports;
- submit reports to Super Admin;
- view team analytics;
- view relevant activity history;
- receive operational notifications.

Admins must only access Members and operational data within their authorized scope.

---

# 10. Role — Member / Staff

Members perform assigned work.

A Member can:

- log in;
- view assigned tasks;
- view task details;
- view priority;
- view deadline;
- view instructions;
- start work;
- update permitted work status;
- add remarks/comments;
- upload supporting files where required;
- submit completed work;
- view Admin feedback;
- receive correction/revision requests;
- correct work;
- resubmit work;
- view personal task history;
- view own workload;
- view personal performance where permitted;
- receive notifications;
- manage permitted personal profile information.

Members cannot:

- assign work;
- manage other Members;
- review other Members' work;
- modify their own performance calculation;
- access organization-wide analytics;
- access Super Admin reports;
- bypass Admin review.

---

# 11. Role-Based Access Control Matrix

The following matrix establishes the initial authorization baseline.

| Capability                     | Super Admin |             Admin             |       Member        |
| ------------------------------ | :---------: | :---------------------------: | :-----------------: |
| Manage Admin accounts          |     ✅      |              ❌               |         ❌          |
| View all Admins                |     ✅      |              ❌               |         ❌          |
| Create Member                  |     ✅      | Scoped / Pending confirmation |         ❌          |
| Edit Member                    |     ✅      |           Own team            | Own limited profile |
| Suspend Member                 |     ✅      |     Pending confirmation      |         ❌          |
| Transfer Member between Admins |     ✅      |              ❌               |         ❌          |
| View all Members               |     ✅      |           Own team            |         ❌          |
| View own profile               |     ✅      |              ✅               |         ✅          |
| Create Task                    |     ✅*     |              ✅               |         ❌          |
| Assign Task                    |     ✅*     |           Own team            |         ❌          |
| Reassign Task                  |     ✅      |           Own team            |         ❌          |
| View all Tasks                 |     ✅      |              ❌               |         ❌          |
| View Team Tasks                |     ✅      |           Own team            |         ❌          |
| View Own Tasks                 |     ✅      |              ✅               |         ✅          |
| Submit Task                    |     ❌      |              ❌               |  Own assigned task  |
| Review Submission              |     ✅*     |           Own team            |         ❌          |
| Approve Work                   |     ✅*     |           Own team            |         ❌          |
| Request Revision               |     ✅*     |           Own team            |         ❌          |
| View Performance               |     All     |           Own team            |         Own         |
| Edit Performance Formula       |     ✅      |              ❌               |         ❌          |
| View Activity Logs             |     All     |            Scoped             |     Limited/Own     |
| Create Management Report       |  Optional   |              ✅               |         ❌          |
| Submit Report to Chief         |  Optional   |              ✅               |         ❌          |
| Review Admin Report            |     ✅      |              ❌               |         ❌          |
| View Global Analytics          |     ✅      |              ❌               |         ❌          |
| View Team Analytics            |     ✅      |              ✅               |         ❌          |
| View Personal Analytics        |     ✅      |              ✅               |         ✅          |
| Manage Inventory               |     ✅      |            Scoped             |         ❌          |
| View Assigned Inventory        |     ✅      |              ✅               |  Own relevant data  |
| System Settings                |     ✅      |              ❌               |         ❌          |

`*` Final Chief operational permissions should be confirmed with the client.

Backend authorization is mandatory.

Hiding frontend buttons is not authorization.

---

# 12. Authentication Requirements

Operix must provide secure authentication.

Minimum requirements:

- email/username and password authentication;
- secure password hashing;
- login;
- logout;
- current authenticated user;
- forgot password;
- reset password;
- session expiration;
- role validation;
- account status validation.

Initial account statuses:

```text
ACTIVE
INACTIVE
SUSPENDED
```

Inactive or suspended accounts must not access protected operational workflows.

Future options:

- two-factor authentication;
- Microsoft/Google enterprise login;
- device/session management.

---

# 13. Core Application Modules

Operix V1 contains the following primary modules:

```text
Authentication
User Management
Team / Responsibility Management
Task Management
Task Assignment
Task Submission
Task Review
Task History
Activity Tracking
Performance Management
Workload Management
Work Queue
Reports
Analytics
Dashboard
Notifications
Real-Time Updates
Excel Migration
File Management
Inventory
Settings
```

---

# 14. Task Management

Task Management is the primary operational module.

A task may contain:

```text
Task ID
Reference Number
Title
Description
Category
Created By
Assigned To
Priority
Deadline
Current Status
Created At
Assigned At
Started At
Submitted At
Completed At
Remarks
Attachments
```

Additional fields must be mapped from the organization's existing Excel workflow.

The real Excel sheets should be analyzed before final task fields are frozen.

---

# 15. Task Priority

Supported initial task priorities:

```text
LOW
MEDIUM
HIGH
URGENT
```

Priority must be visible in:

- task lists;
- task details;
- assignment views;
- workload views;
- analytics where relevant.

---

# 16. Canonical Task Lifecycle

V1 standardizes the task lifecycle to avoid contradictory states.

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
   ├──────────────→ COMPLETED
   │
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

---

# 17. Overdue Logic

`OVERDUE` should initially be treated as a **derived operational condition**, not a manually selected workflow state.

A task is overdue when:

```text
Current Time > Deadline
AND
Task Status is not COMPLETED
AND
Task Status is not CANCELLED
```

The UI may display:

```text
Status: IN_PROGRESS
Alert: OVERDUE
```

This preserves the real task state while still making overdue work visible.

If the actual business workflow requires a persisted `OVERDUE` state, this can be changed after confirmation.

---

# 18. Task Lifecycle Rules

Examples:

### Allowed

```text
PENDING → ASSIGNED
ASSIGNED → IN_PROGRESS
IN_PROGRESS → SUBMITTED
SUBMITTED → UNDER_REVIEW
UNDER_REVIEW → COMPLETED
UNDER_REVIEW → REVISION_REQUIRED
REVISION_REQUIRED → RESUBMITTED
RESUBMITTED → UNDER_REVIEW
```

### Not Allowed

```text
MEMBER → manually set COMPLETED

MEMBER → approve own work

IN_PROGRESS → COMPLETED without submission/review

COMPLETED → silently return to IN_PROGRESS
```

Completed tasks should not be silently edited.

Administrative correction workflows, if needed, must preserve audit history.

---

# 19. Task Assignment

Admins can assign tasks to Members within permitted scope.

The assignment interface should provide:

```text
Member Name
Current Active Tasks
Overdue Tasks
Completion Rate
On-Time Completion Rate
Performance Score
Relevant Task History
```

Example:

| Member   | Active | Overdue | Completion | Performance |
| -------- | -----: | ------: | ---------: | ----------: |
| Member A |     17 |       3 |        91% |          88 |
| Member B |      3 |       0 |        96% |          93 |
| Member C |      8 |       1 |        88% |          86 |
| Member D |      1 |       0 |        94% |          91 |

The system should help Admins understand workload before assignment.

---

# 20. Performance-Assisted Assignment

Operix should provide **decision support**.

The system should not blindly assign more work to the highest-performing Member.

Assignment considerations may include:

- current active workload;
- overdue workload;
- completion rate;
- on-time completion;
- performance;
- task priority;
- deadline;
- task category;
- suitability;
- historical completion;
- availability.

MVP behavior:

```text
System provides information/recommendations
              ↓
Admin makes final assignment decision
```

Automatic task assignment is not part of the MVP.

---

# 21. Work Queue

Operix may provide a centralized queue of unassigned work.

Example:

```text
URGENT
HIGH
MEDIUM
LOW
```

Admins can use the queue to assign work based on:

- priority;
- deadline;
- Member workload;
- performance;
- category;
- suitability.

Whether the Work Queue is mandatory in the first MVP should be confirmed during detailed workflow analysis.

---

# 22. Task Submission

Members can submit work for assigned tasks.

A submission may contain:

```text
Task
Member
Submission Version
Submission Remarks
Supporting Files
Submitted At
```

V1 supports Task and Submission attachments for:

```text
PDF
JPEG
PNG
WebP
DOCX
XLSX
PPTX
```

V1 limits:

```text
max file size = 10 MiB
max files = 5 per Task or Submission version
```

Files are stored through authenticated Cloudinary storage and downloaded through Operix authorization. Public file URLs, report attachments, direct browser upload, antivirus scanning, OCR, previews, and thumbnails remain deferred.

---

# 23. Task Review

After submission, the Admin reviews the work.

Initial review actions:

```text
APPROVE
REQUEST_REVISION
```

Optional business action:

```text
REJECT
```

A separate permanent `REJECTED` task state should only be added if the organization's actual workflow distinguishes rejection from revision.

### Approval

```text
UNDER_REVIEW
      ↓
COMPLETED
```

### Revision

```text
UNDER_REVIEW
      ↓
REVISION_REQUIRED
      ↓
Member Corrects Work
      ↓
RESUBMITTED
      ↓
UNDER_REVIEW
```

---

# 24. Submission & Review History

Operix must preserve all important submission versions.

Example:

```text
Version 1
Submitted: 10:30
Reviewed: 11:00
Result: Revision Required

Version 2
Submitted: 13:20
Reviewed: 14:05
Result: Approved
```

Previous submissions should not be overwritten by the latest submission.

---

# 25. Task History

The platform must preserve significant task changes.

Example:

```text
Task #1042

10:02 — Created by Admin A
10:04 — Assigned to Member B
10:31 — Work started
14:12 — Submitted
14:30 — Revision requested
15:02 — Resubmitted
15:20 — Approved / Completed
```

Task history supports:

- audit trail;
- performance calculations;
- reporting;
- activity feeds;
- management investigation.

---

# 26. Activity Tracking

Important operations automatically create structured activity records.

Examples:

```text
USER_CREATED
USER_UPDATED
USER_STATUS_CHANGED
MEMBER_ASSIGNED
MEMBER_TRANSFERRED

TASK_CREATED
TASK_ASSIGNED
TASK_REASSIGNED
TASK_STARTED
TASK_SUBMITTED
TASK_REVISION_REQUESTED
TASK_RESUBMITTED
TASK_APPROVED
TASK_COMPLETED
TASK_CANCELLED

REPORT_CREATED
REPORT_SUBMITTED
REPORT_REVIEWED

INVENTORY_CREATED
INVENTORY_ADJUSTED
INVENTORY_ASSIGNED
INVENTORY_RETURNED
```

Each activity should contain:

```text
Actor
Action
Entity Type
Entity ID
Metadata
Timestamp
```

Optional technical audit information:

```text
IP Address
User Agent
Request ID
```

Sensitive authentication information must never be recorded in activity metadata.

---

# 27. Core Activity Principle

Whenever an important business operation occurs:

```text
Business Action
      ↓
Database Change
      ↓
Activity Record
      ↓
Notification if relevant
      ↓
Analytics/Performance impact
      ↓
Dashboard visibility
```

Example:

```text
Member submits task
      ↓
Submission stored
      ↓
Task state changes
      ↓
TASK_SUBMITTED activity created
      ↓
Admin notification created
      ↓
Dashboard pending-review count changes
      ↓
Real-time event may update Admin UI
```

---

# 28. Performance Management

Performance should be based primarily on actual work activity.

Potential metrics include:

```text
Completion Rate
On-Time Completion Rate
Rejection / Revision Rate
Average Completion Time
Rework Rate
Task Complexity
Task Priority
Current Workload
Quality Rating
Consistency
```

Completed task count alone must not define performance.

---

# 29. Performance Formula

The final performance calculation is a **client decision**.

Illustrative metrics may include:

| Metric                 | Example Weight |
| ---------------------- | -------------: |
| Completion Rate        |            30% |
| On-Time Completion     |            25% |
| Quality / Review Score |            25% |
| Rework / Revision      |            10% |
| Consistency            |            10% |

These values are examples only.

The organization must define:

- final metrics;
- weights;
- reporting periods;
- whether task priority matters;
- whether task complexity matters;
- whether manual quality rating is used;
- whether Super Admin can override a calculated score.

---

# 30. Performance Versioning

If the performance formula changes over time, Operix should retain enough information to explain historical performance.

Recommended concept:

```text
Performance Record
Period
Calculation Version
Metric Values
Overall Score
Generated At
```

This avoids historical scores becoming impossible to explain after formula changes.

---

# 31. Workload Management

The system should make workload imbalance visible.

Important workload indicators:

```text
Active Tasks
Pending Tasks
Overdue Tasks
Upcoming Deadlines
Priority Distribution
Completion Rate
Performance
Task Category
Availability
```

Example:

```text
Member A
17 active
3 overdue
91% completion

Member B
3 active
0 overdue
96% completion

Member C
8 active
1 overdue
88% completion

Member D
1 active
0 overdue
94% completion
```

High performance should not automatically mean high capacity.

---

# 32. Super Admin Dashboard

The Super Admin dashboard provides organization-wide visibility.

## KPI Cards

```text
Total Admins
Total Members
Total Tasks
Pending Tasks
In Progress
Submitted / Under Review
Completed Tasks
Overdue Tasks
Overall Completion Rate
```

## Analytics

```text
Task Status Distribution
Task Completion Trend
Workload by Admin
Workload by Member
Member Performance
Team Performance
Completed vs Pending
Overdue Trend
Weekly Productivity
Monthly Productivity
Report Status
```

## Operational Activity

The dashboard should include important recent events.

Example:

```text
Admin A assigned Task #1042
Member B submitted Task #1042
Admin C requested revision on Task #990
Admin D submitted Monthly Report
```

---

# 33. Admin Dashboard

The Admin dashboard focuses on Members and workload under the Admin.

## KPI Cards

```text
Total Members
Assigned Tasks
Pending Tasks
In Progress
Submitted for Review
Completed
Overdue
Team Completion Rate
```

## Analytics

```text
Member Performance
Member Workload
Task Status Distribution
Completion Trend
Overdue Work
Revision / Rework Rate
On-Time Completion
```

## Action Areas

Admin should quickly see:

```text
Tasks waiting for review
Members with heavy workload
Members with available capacity
Overdue tasks
Upcoming deadlines
Recent submissions
```

---

# 34. Member Dashboard

The Member dashboard focuses only on personal workload.

## KPI Cards

```text
Assigned
Pending
In Progress
Submitted
Revision Required
Completed
Overdue
```

## Personal Analytics

```text
Completion Trend
Completed vs Pending
Average Completion Time
On-Time Completion
Personal Workload
Personal Performance
```

The Member dashboard should prioritize:

```text
What do I need to do now?
What is due soon?
What needs correction?
```

---

# 35. Analytics Architecture

Operix must not load large raw task datasets into the browser to calculate simple dashboard analytics.

Preferred architecture:

```text
Database
   ↓
Database / Backend Aggregation
   ↓
Dashboard API
   ↓
Frontend
   ↓
Charts
```

Backend/database aggregation should be used where practical for:

- count;
- sum;
- average;
- status distribution;
- trend calculation;
- workload summary;
- performance aggregation.

---

# 36. Dashboard APIs

Initial business-focused endpoints may include:

```http
GET /api/v1/dashboard/overview
GET /api/v1/dashboard/task-status
GET /api/v1/dashboard/task-trends
GET /api/v1/dashboard/workload
GET /api/v1/dashboard/member-performance
GET /api/v1/dashboard/overdue
GET /api/v1/dashboard/activity
```

Responses must be authorization-aware.

The same endpoint may return different scope depending on viewer role.

---

# 37. Real-Time Updates

Real-time does not mean refreshing every page every second.

Real-time should be reserved for meaningful operational events.

Potential events:

```text
TASK_ASSIGNED
TASK_SUBMITTED
TASK_RESUBMITTED
TASK_APPROVED
TASK_REVISION_REQUESTED
NOTIFICATION_CREATED
IMPORTANT_ACTIVITY
DASHBOARD_COUNTER_CHANGED
```

Possible implementation:

```text
REST API
+
WebSocket / Socket.IO
```

Normal CRUD remains REST-based.

---

# 38. Real-Time Example

```text
Member submits task
      ↓
Backend validates request
      ↓
Database transaction completes
      ↓
Activity created
      ↓
Notification created
      ↓
Real-time event emitted
      ↓
Admin receives notification
      ↓
Pending Review counter updates
```

Real-time failure must not cause the underlying task transaction to fail after the database has already successfully committed.

---

# 39. Notifications

## Member Notifications

```text
New Task Assigned
Deadline Approaching
Revision Required
Admin Feedback
Task Approved
Task Completed
```

## Admin Notifications

```text
Task Submitted
Task Resubmitted
Task Overdue
Important Member Activity
Upcoming Deadline
```

## Super Admin Notifications

```text
Admin Report Submitted
Important Operational Alert
Critical Overdue Work
Organization-Level Event
```

MVP channel:

```text
In-App Notification
```

V1 email channel:

```text
TASK_ASSIGNED
→ best-effort SMTP email to the assigned Member after the database transaction commits

WELCOME_USER
→ best-effort SMTP email after account provisioning and required Activity succeed

PASSWORD_RESET
→ Better Auth native password-reset email with non-enumerating request semantics
```

Email rendering uses server-controlled EJS templates, shared layout and CSS,
inlined styles, and a plain-text alternative. Welcome mail never contains the
initial password. Password-reset tokens and reset URLs must not be logged.

Database Notification creation does not automatically send SMTP email. External
email routing remains explicit per approved business event.

Possible future channels:

```text
Push Notification
SMS
WhatsApp
```

Additional external channels should only be added when confirmed.

---

# 40. Reporting — Two Separate Concepts

Operix V1 separates reports into two categories.

---

# 41. System-Generated Reports

These reports are automatically produced from platform data.

Examples:

```text
Daily Workload Report
Weekly Workload Report
Monthly Workload Report
Member Performance Report
Admin Activity Report
Task Completion Report
Pending Task Report
Overdue Task Report
Revision / Rejection Report
Workload Distribution Report
```

Filters may include:

```text
Date Range
Admin
Member
Status
Priority
Category
Department / Team
```

Exports may include:

```text
Excel
PDF
CSV
```

depending on business requirements.

---

# 42. Admin-Submitted Management Reports

These are reports prepared by Admins and submitted to the Super Admin.

Example contents:

```text
Report Title
Reporting Period
Admin
Team
Operational Summary
Completed Work
Pending Work
Overdue Work
Performance Summary
Key Issues
Actions Taken
Remarks
Next Period Plan
Attachments
```

Potential statuses:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
REVISION_REQUIRED
APPROVED
```

Final report templates and cadence must be confirmed by the company.

V1 implementation decision:

```text
ManagementReport
→ current editable Admin working copy

ManagementReportVersion
→ immutable submitted snapshot

ManagementReportReview
→ immutable Super Admin decision for one submitted version
```

Every Management Report belongs to one Team and one historical Admin author.
Admins may create drafts, edit drafts or revision-required reports, and submit
versions. Super Admin may approve or request revision. `submittedAt` on the
report means latest submission time; each version preserves its own submitted
time. Attachments, fixed cadence, fixed report type templates, `REJECT`, report
email, PDF, CSV, stored exports, scheduled exports, and emailed report delivery
remain deferred.

Read only system generated XLSX export of authorized Management Report data is
supported. This export does not replace or change the Admin submitted
Management Report workflow.

---

# 43. Excel Replacement Strategy

The goal is **not** to rebuild Excel inside a browser.

Existing spreadsheet data should be migrated into structured entities.

Migration workflow:

```text
Existing Excel
      ↓
Analyze Structure
      ↓
Identify Sheets & Columns
      ↓
Clean Data
      ↓
Map Columns
      ↓
Resolve Duplicates
      ↓
Validate
      ↓
Import
      ↓
Verify
      ↓
Platform Database
```

V1 Excel migration currently supports:

```text
Historical terminal Task import
Existing Member designation enrichment
System generated XLSX exports
```

Member Excel import is deliberately not bulk account administration. It validates `employeeId`, `email`, and current Team context, then updates only `User.designation` for existing `MEMBER` accounts.

Member Excel import must not create accounts, provision Better Auth, change identity fields, change roles or statuses, transfer Teams, create Notifications, or send email.

V1 XLSX exports are read only generated workbooks for Tasks, Performance, Dashboard workload/trends, and Management Reports. Exports must use Operix authorization, scoped reads, and canonical calculators. Excel displays Operix results; Excel formulas must not become business truth.

CSV, PDF, stored exports, scheduled exports, and email delivery of exports remain deferred.

---

# 44. Example Excel Mapping

Possible mapping:

| Excel Column   | Operix Entity                   |
| -------------- | ------------------------------- |
| Staff Name     | User                            |
| Work           | Task                            |
| Assigned By    | Task Assignment                 |
| Assigned To    | Member / Task Assignment        |
| Deadline       | Task Deadline                   |
| Status         | Task Status                     |
| Completed Date | Task Completion                 |
| Remarks        | Submission / Review / Task Note |

Exact mapping must come from the company's real Excel files.

---

# 45. New Source of Truth

After successful implementation and migration:

```text
Operix Database = Source of Truth
```

Excel will primarily be used for:

```text
Export
Import
Management Reporting
Historical Migration
```

Users should not maintain a separate operational Excel file that conflicts with Operix.

---

# 46. Inventory Module — Confirmed V1

Inventory V1 is confirmed as a Team-scoped stock and returnable-resource module.

Inventory V1 supports:

```text
Global Inventory Categories
Team-scoped Inventory Items
Available integer quantity
Stock In
Consumable Stock Out
Audited Stock Adjustment
Optional Member attribution for consumable Stock Out
Returnable Item Assignment to Members
Partial and Full Return
Immutable Inventory Transaction History
Derived Low-Stock and Out-of-Stock state
Scoped Inventory Summary
```

---

# 47. Inventory Implementation Rule

Inventory V1 must not add:

```text
Warehouse / branch inventory
Supplier
Procurement
Purchase order
Sales / accounting
Unit cost / valuation
Batch / lot
Expiry
Serial number
Barcode
Depreciation
Stock transfer
Task linkage
Inventory attachments
Inventory Excel import/export
CSV/PDF
WebSocket inventory events
SMTP inventory email
Automatic replenishment
```

Advanced inventory features must not be invented without confirmation.

---

# 48. Core Data Entities

Initial domain entities:

```text
User
Role
Department / Team
Task
TaskAssignment
TaskSubmission
TaskReview
TaskStatusHistory
PerformanceRecord
ActivityLog
Notification
Report
ReportAttachment
InventoryItem
InventoryTransaction
InventoryAssignment
```

Final schema must reflect:

- confirmed business workflow;
- actual Excel structure;
- role ownership;
- task assignment rules;
- inventory requirements.

---

# 49. Search

Operix should support search using appropriate business keys.

Examples:

```text
Task ID
Task Title
Member Name
Admin Name
Employee ID
Report Title
Inventory Item
SKU
```

---

# 50. Filters

Common filters may include:

```text
Date Range
Task Status
Task Priority
Admin
Member
Category
Department
Performance Range
Overdue
```

---

# 51. Sorting

Operational tables should support relevant sorting.

Examples:

```text
Newest
Oldest
Deadline
Priority
Status
Member
Performance
Completion Date
```

---

# 52. Pagination

Large operational datasets must use pagination.

Typical examples:

```text
20 per page
50 per page
100 per page
```

API limits should prevent unbounded data retrieval.

---

# 53. File Management

Supporting files may be attached to:

```text
Tasks
Submissions
Reports
User Profiles
Inventory Records
```

Each uploaded asset should retain:

```text
File Name
MIME Type
File Size
Storage Reference
Uploaded By
Uploaded At
Related Entity
```

Final file limits require confirmation.

---

# 54. Auditability

Important operational records must not be silently overwritten.

Operix should preserve:

```text
Task Assignment History
Task State History
Submission History
Review History
Activity History
Performance History
Report History
Inventory Transaction History
```

---

# 55. Non-Functional Requirements

## Security

Operix must provide:

- secure authentication;
- backend-enforced RBAC;
- protected APIs;
- input validation;
- secure file handling;
- account status enforcement;
- rate limiting where appropriate;
- secure headers;
- audit/activity logging;
- protection from unauthorized data access.

## Performance

The platform should provide:

- pagination;
- optimized queries;
- database indexes;
- backend aggregation;
- efficient dashboards;
- minimal unnecessary frontend processing.

## Scalability

The system should support growth in:

- users;
- tasks;
- submissions;
- activity logs;
- reports;
- notifications;
- performance records;
- inventory records.

## Reliability

Critical operations must be persisted reliably.

Examples:

```text
Task Assignment
Task Submission
Task Review
Approval
Revision Request
Member Transfer
User Status Changes
Inventory Transactions
```

---

# 56. Transactional Operations

Operations involving multiple dependent database changes should execute transactionally.

Example:

```text
Member submits task

1. Create submission
2. Update task state
3. Create task history
4. Create activity
5. Create notification
```

These related writes should not leave the system in a partially updated state.

---

# 57. Responsive Design

Operix should support:

```text
Desktop
Laptop
Tablet
Mobile
```

Primary Admin and Super Admin workflows are desktop-oriented.

Member task workflows must remain comfortable on mobile devices.

---

# 58. Recommended Technical Architecture

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
React Hook Form
Zod
Recharts
```

## Backend

```text
NestJS
TypeScript
Prisma ORM
PostgreSQL
```

## Authentication

Candidate:

```text
Better Auth
```

or another finalized secure session-based authentication mechanism.

## File Storage

Candidate:

```text
Cloudinary
```

or:

```text
S3-Compatible Object Storage
```

---

# 59. Backend Architecture Rule

Canonical request flow:

```text
Route / Module
      ↓
Controller
      ↓
Service
      ↓
Prisma
      ↓
PostgreSQL
```

Controllers should remain thin.

Business logic belongs in services.

Authorization must be enforced before accessing or modifying protected resources.

---

# 60. API Namespace

Recommended API namespace:

```text
/api/v1
```

Primary resource groups:

```text
/auth
/users
/admins
/members
/teams
/tasks
/submissions
/performance
/reports
/inventory
/notifications
/activity-logs
/dashboard
/analytics
/settings
```

---

# 61. Requirement Identification System

Development requirements should use stable IDs.

Naming convention:

```text
AUTH-FR-###
USER-FR-###
TASK-FR-###
SUB-FR-###
PERF-FR-###
RPT-FR-###
AN-FR-###
NOT-FR-###
ACT-FR-###
INV-FR-###
```

---

# 62. Core Functional Requirements

## Authentication

**AUTH-FR-001**
The system shall allow an active user to authenticate.

**AUTH-FR-002**
The system shall prevent suspended or inactive accounts from normal protected access.

**AUTH-FR-003**
The system shall expose the current authenticated user's role and permitted application scope.

---

## User Management

**USER-FR-001**
Super Admin shall be able to create and manage Admin accounts.

**USER-FR-002**
Super Admin shall be able to view Members organization-wide.

**USER-FR-003**
Admin shall only access Members within permitted responsibility scope.

**USER-FR-004**
Member shall not access another Member's management data.

---

## Task Management

**TASK-FR-001**
Authorized Admin users shall be able to create tasks.

**TASK-FR-002**
Authorized Admin users shall be able to assign tasks to permitted Members.

**TASK-FR-003**
A Member shall only access tasks assigned to that Member unless a broader business permission is explicitly granted.

**TASK-FR-004**
The system shall enforce valid task state transitions.

**TASK-FR-005**
Important task state changes shall create task history.

**TASK-FR-006**
Important task state changes shall create activity records.

**TASK-FR-007**
The system shall identify overdue tasks from deadline and task state.

---

## Submission

**SUB-FR-001**
A Member shall be able to submit an assigned task.

**SUB-FR-002**
A submission shall preserve its submission timestamp.

**SUB-FR-003**
Revision/resubmission shall not overwrite previous submission versions.

**SUB-FR-004**
An Admin shall only review submissions within permitted scope.

**SUB-FR-005**
A Member shall not approve their own submission.

---

## Performance

**PERF-FR-001**
Performance metrics shall be derived from structured operational activity.

**PERF-FR-002**
Completed task count alone shall not define overall performance.

**PERF-FR-003**
The performance formula shall remain configurable or versioned if calculation rules change.

---

## Reports

**RPT-FR-001**
The platform shall generate operational reports from stored platform data.

**RPT-FR-002**
Authorized Admins shall be able to submit management reports to the Super Admin where required.

**RPT-FR-003**
Super Admin shall be able to review submitted Admin reports.

---

## Analytics

**AN-FR-001**
Dashboard charts shall use actual platform data.

**AN-FR-002**
Large analytics calculations should be aggregated by the backend/database rather than calculated from entire raw task datasets in the frontend.

**AN-FR-003**
Analytics responses shall respect viewer authorization scope.

---

## Activity

**ACT-FR-001**
Important operational changes shall generate structured activity records.

**ACT-FR-002**
Activity records shall include actor, action, entity, metadata, and timestamp.

---

## Notifications

**NOT-FR-001**
Important workflow events shall generate notifications for relevant users.

**NOT-FR-002**
MVP notifications shall support in-app delivery.

---

# 63. Core Acceptance Criteria

## AC-001 — Admin Task Assignment

**Given**

Admin A manages Member A.

**When**

Admin A creates and assigns a task to Member A.

**Then**

- the task is stored;
- assignment is stored;
- Member A can access the task;
- unauthorized Members cannot access the task;
- `TASK_ASSIGNED` activity is created;
- Member A receives a notification;
- relevant dashboard counters update.

---

## AC-002 — Member Submission

**Given**

Member A has an active assigned task.

**When**

Member A submits completed work.

**Then**

- a submission is stored;
- submission timestamp is recorded;
- task moves to the review workflow;
- task history is updated;
- `TASK_SUBMITTED` activity is created;
- responsible Admin receives a notification.

---

## AC-003 — Revision

**Given**

A submitted task is under Admin review.

**When**

Admin requests revision.

**Then**

- review feedback is stored;
- task enters `REVISION_REQUIRED`;
- Member receives notification;
- review history is preserved;
- Member can submit a new version.

---

## AC-004 — Completion

**Given**

A valid submission is under review.

**When**

Admin approves the work.

**Then**

- review record is stored;
- task enters `COMPLETED`;
- completion timestamp is stored;
- activity is generated;
- Member is notified;
- performance/workload data reflects the completion;
- dashboard counters update.

---

## AC-005 — Authorization Isolation

**Given**

Admin A and Admin B manage different Members.

**When**

Admin A attempts to access Admin B's private Member/task/submission data.

**Then**

the backend must deny access.

Frontend hiding alone is insufficient.

---

## AC-006 — Overdue Detection

**Given**

a task deadline has passed and the task is not completed or cancelled.

**Then**

Operix shall identify the task as overdue in:

- task views;
- Admin dashboard;
- Super Admin dashboard;
- relevant reports;
- relevant analytics.

---

# 64. MVP Roadmap

## Phase 1 — Foundation

```text
Authentication
RBAC
User Management
Database Structure
Basic Application Shell
Basic Dashboards
```

## Phase 2 — Core Workflow

```text
Task Creation
Task Assignment
Task Status
Task Submission
Task Review
Revision
Approval
Task History
Activity Tracking
```

## Phase 3 — Analytics & Reports

```text
KPI Dashboards
Task Analytics
Performance Metrics
Workload Analytics
Reports
Filters
Activity Feed
```

## Phase 4 — Real-Time

```text
Task Update Events
Notifications
Activity Events
Dashboard Counter Updates
```

## Phase 5 — Excel Migration

```text
Excel Analysis
Data Cleaning
Column Mapping
Import
Validation
Historical Data Migration
Excel Export
PDF Reporting where required
```

## Phase 6 — Inventory

Confirmed V1 scope: Team-scoped stock, returnable assignment, returns, immutable ledger, and scoped summary.

## Phase 7 — Advanced Analytics

Possible later features:

```text
Workload Recommendations
Performance Trends
Workload Balancing Suggestions
Advanced Operational Analytics
Predictive Workload Analysis
```

---

# 65. Deferred / Future Scope

Not part of the initial MVP unless explicitly approved:

```text
Fully Automatic Task Assignment
AI Task Assignment
Predictive AI
Payroll
Attendance
HRIS
CRM
Accounting
Procurement
Advanced Warehouse Management
Multi-Company SaaS
Native Mobile Application
Biometric Integration
WhatsApp Automation
SMS Automation
External ERP Integration
```

---

# 66. Success Criteria

Operix will be considered successful when:

1. Excel is no longer the primary operational workload tracker.
2. Work can be created and assigned digitally.
3. Work can be tracked from assignment to completion.
4. Members can submit work digitally.
5. Admins can review work digitally.
6. Revision history is preserved.
7. Member performance can be monitored.
8. Admin activity can be monitored.
9. Pending work can be identified immediately.
10. Overdue work can be identified immediately.
11. Workload imbalance becomes visible.
12. Reports can be generated without manual spreadsheet calculations.
13. Dashboards reflect current operational data.
14. Important updates can appear in real time.
15. Historical task/activity information remains available.
16. Data can be exported when required.
17. The Chief can obtain a complete organizational overview from one system.

---

# 67. Key Business Questions Before Development

## Organization

- How many Admins exist?
- How many Members exist?
- Are there departments?
- Are there teams?
- Are there branches?
- Can one Member report to multiple Admins?
- Can Admins create Members?
- Can Admins suspend Members?
- Can Chief directly assign tasks?

## Tasks

- What exact work is currently tracked?
- What columns exist in the Excel files?
- What defines completion?
- Who performs final approval?
- Can one task have multiple Members?
- Can Members decline work?
- Can tasks be reassigned?
- Can tasks be cancelled?
- Can deadlines change?
- Are recurring tasks needed?
- Does the company distinguish rejection from revision?

## Performance

- How is performance currently measured?
- Does priority affect performance?
- Does complexity affect performance?
- Does Admin rating affect performance?
- What is considered good performance?
- What reporting period is used?

## Reports

- What reports does the Chief currently receive?
- Daily?
- Weekly?
- Monthly?
- What exact report format is required?
- Are Admin-written management summaries required?
- Does Chief approve/reject reports?
- Is Excel export mandatory?
- Is PDF export mandatory?

## Inventory

- Is inventory actually part of the workflow?
- What items are tracked?
- Stock or assets?
- Are quantities required?
- Stock-in?
- Stock-out?
- Returns?
- Are warehouses required?
- Is inventory linked to tasks?

## Files

- [x] V1 Task/Submission file types: PDF, JPEG, PNG, WebP, DOCX, XLSX, PPTX
- [x] V1 maximum file size: 10 MiB
- [x] V1 maximum file count: 5 files per Task or Submission version
- [ ] Management Report attachments
- [ ] Antivirus / malware scanning
- [ ] OCR / previews / thumbnails

## Real-Time

- Which events require immediate updates?
- Which roles require live activity?
- Are dashboard counters real-time?
- Are external notifications required?

## Migration

- How many Excel files exist?
- How many sheets exist?
- How much historical data is required?
- Are staff names consistent?
- Are duplicate records present?
- Are statuses standardized?
- Are task IDs available?

---

# 68. Development Lock Conditions

The following should be confirmed before major domain implementation:

```text
Role Permission Matrix
Task State Machine
Member/Admin Relationship
Task Assignment Cardinality
Performance Formula
Report Workflow
Inventory Scope
Excel Structure
File Limits
Notification Scope
```

The core architecture can begin before every business answer is complete, but unresolved requirements must not be replaced by invented business rules.

---

# 69. Final Product Architecture

```text
OPERIX
   │
   ├── Users / Teams
   │
   ├── Tasks / Assignments
   │
   ├── Submissions / Reviews
   │
   ├── Inventory
   │
   ↓
Activities
   ↓
Central Database
   ↓
Performance
Reports
Notifications
Analytics
   ↓
Dashboards
Real-Time Updates
   ↓
Management Decision
```

---

# 70. Core Product Principle

Every important operational action should generate structured information that the platform can use for:

```text
Tracking
Reporting
Performance Analysis
Workload Analysis
Notifications
Audit History
Analytics
Management Decision-Making
```

The permanent Operix operational philosophy is:

# Work → Activity → Data → Analytics → Decision

---

# 71. Product Positioning

## Product Name

**Operix**

## Full Product Title

**Operix — Pharmaceutical Workload & Operations Management Platform**

## Short Description

**Smart Workforce, Task & Operational Management**

## Primary Tagline

**Operate. Track. Perform.**

## Product Statement

Operix is a role-based enterprise operational management platform that enables organizational leadership to monitor work from assignment through completion, allows Admins to distribute and review work using real workload and performance information, enables Members to execute and submit tasks digitally, and converts operational activity into structured data, reports, analytics, notifications, and management insight.

---

# 72. V1 Development Priority

The recommended development order is:

```text
Authentication
     ↓
RBAC
     ↓
Users / Teams
     ↓
Task Assignment
     ↓
Task Execution
     ↓
Submission
     ↓
Review / Revision
     ↓
Activity Tracking
     ↓
Performance
     ↓
Reports
     ↓
Analytics
     ↓
Real-Time
     ↓
Excel Migration
     ↓
Inventory
```

The first production objective is to make the **core work lifecycle trustworthy**.

Charts and advanced analytics should be built on top of accurate operational data rather than before it.

# Public Record Identity

Prisma primary keys are server-private implementation details. Every database-record locator or relationship reference crossing an HTTP, XLSX, Notification, Activity, or email boundary uses an immutable public UUID. Existing response names such as `id`, `teamId`, and `taskId` remain, but their values are public UUIDs. Public UUID knowledge grants no authorization.

Approved business identifiers—including employee ID, task reference code, SKU, email, and human-readable names—remain valid client-facing product data. Internal authorization, relations, workflow state, calculations, and transaction logic continue using private database IDs.

# Self Registration and Approval

Operix accepts privacy safe public access requests containing applicant name and email. An applicant remains separate from the authenticated User model until a Super Admin assigns the `ADMIN` or `MEMBER` role and approves the request. Approved accounts start inactive and become active only after the applicant configures a password through Better Auth's native reset flow.

Registration requests support `PENDING`, operational `APPROVING`, `APPROVED`, and `REJECTED` states. Public signup remains disabled. Receipt, setup, and generic rejection email delivery is best effort. Registration review data is retained for 90 days after rejection or completed setup, while approved setup pending requests are retained.
