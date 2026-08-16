# OPERIX — Master Product Requirements Document

**Product Name:** Operix
**Product Title:** Pharmaceutical Workload & Operations Management Platform
**Product Type:** Internal Enterprise Workload, Task, Performance, Reporting & Operational Management System
**Industry:** Pharmaceutical / Medical Company
**Version:** 1.0
**Document Status:** Master PRD / Product Definition / Development Baseline
**Primary Objective:** Replace Excel-based operational workload tracking with a centralized, workflow-driven digital platform.

---

## 1. Executive Product Definition

Operix is an internal enterprise operations platform designed for pharmaceutical and medical organizations to manage:

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

Permanent product principle:

```text
Work → Activity → Structured Data → Analytics → Decision
```

Operix is not simply an Excel replacement, task CRUD system, inventory application, or dashboard. It is a workflow-driven operational management platform where every meaningful work action generates structured information that management can use for monitoring, reporting, performance measurement, workload balancing, and decision-making.

---

## 2. Business Problem

The organization currently relies on Excel-based workload tracking, creating:

- fragmented data;
- manual updates;
- manual calculations;
- weak traceability;
- limited real-time visibility;
- difficulty measuring performance;
- workload imbalance;
- manual report preparation;
- poor activity history;
- delayed identification of overdue work.

Operix centralizes these operations.

---

## 3. Current vs Future Workflow

### Existing

```text
Excel
→ Manual Updates
→ Manual Tracking
→ Manual Calculations
→ Manual Reports
→ Chief Review
```

### Operix

```text
Create & Assign Work
→ Member Executes
→ Member Submits
→ Admin Reviews
→ Activity Automatically Recorded
→ Central Database
→ Performance + Reports + Notifications
→ Analytics
→ Management Dashboard
→ Decision
```

---

## 4. Product Goals

Operix must:

1. Replace Excel as the primary workload tracking system.
2. Centralize organizational work.
3. Create a structured task workflow.
4. Enforce backend RBAC.
5. Allow Admins to assign work.
6. Allow Members to execute and submit work.
7. Allow Admins to review submitted work.
8. Preserve task/review history.
9. Track important activities automatically.
10. Measure staff performance from actual operational data.
11. Make workload imbalance visible.
12. Support performance-informed work allocation.
13. Provide dynamic dashboards.
14. Provide operational reports.
15. Provide management analytics.
16. Identify overdue/pending work immediately.
17. Support important real-time updates.
18. Preserve historical data.
19. Support Excel export.
20. Support PDF reporting where required.

---

## 5. Canonical Roles

Backend roles:

```text
SUPER_ADMIN
ADMIN
MEMBER
```

UI/business labels:

```text
SUPER_ADMIN → Chief / Super Admin
ADMIN       → Admin
MEMBER      → Member / Staff
```

Do not create separate role enums for Chief, Staff, Employee, etc.

---

## 6. User Hierarchy

```text
SUPER_ADMIN / CHIEF
        │
        ├── ADMIN A
        │    ├── MEMBER 1
        │    └── MEMBER 2
        │
        └── ADMIN B
             ├── MEMBER 3
             └── MEMBER 4
```

Default V2 assumption:
- one Member has one primary responsible Admin;
- one Admin manages many Members;
- Super Admin has organization-wide visibility.

Multiple-Admin relationships remain pending confirmation.

---

## 7. Super Admin / Chief

Can:

- manage Admin accounts;
- view Members organization-wide;
- assign/transfer Members to Admins;
- view all tasks/assignments/submissions/reviews/history;
- view Admin and Member activity;
- view workload distribution;
- view performance;
- view reports;
- review Admin-submitted reports;
- view analytics;
- monitor overdue work;
- monitor task completion;
- access system-level settings where applicable;
- export data where allowed.

---

## 8. Admin

Within authorized scope, Admin can:

- view/manage responsible Members;
- view workload/performance/history;
- create tasks;
- assign/reassign tasks;
- set priority/deadline;
- monitor progress;
- review submissions;
- approve or request revision;
- reject only if final business workflow requires it;
- add feedback/ratings;
- create and submit management reports;
- view team analytics;
- view relevant activity;
- receive notifications.

---

## 9. Member / Staff

Can:

- log in;
- view assigned tasks;
- view details/priority/deadline;
- start work;
- submit work;
- add remarks;
- upload supporting files;
- receive feedback;
- correct and resubmit;
- view own task history;
- view own workload/performance where permitted;
- receive notifications.

Cannot:
- assign work;
- manage Members;
- review others' work;
- modify own performance calculation;
- access global analytics/reports.

---

## 10. RBAC Matrix

| Capability | Super Admin | Admin | Member |
|---|:---:|:---:|:---:|
| Manage Admins | ✅ | ❌ | ❌ |
| View all Admins | ✅ | ❌ | ❌ |
| Create Member | ✅ | Scoped / Pending | ❌ |
| Edit Member | ✅ | Own team | Own limited |
| Suspend Member | ✅ | Pending | ❌ |
| Transfer Member | ✅ | ❌ | ❌ |
| View all Members | ✅ | Own team | ❌ |
| Create Task | ✅* | ✅ | ❌ |
| Assign Task | ✅* | Own team | ❌ |
| Reassign Task | ✅ | Own team | ❌ |
| View all Tasks | ✅ | ❌ | ❌ |
| View Team Tasks | ✅ | ✅ | ❌ |
| View Own Tasks | ✅ | ✅ | ✅ |
| Submit Task | ❌ | ❌ | Own |
| Review Submission | ✅* | Own team | ❌ |
| Approve Work | ✅* | Own team | ❌ |
| Request Revision | ✅* | Own team | ❌ |
| View Performance | All | Own team | Own |
| Edit Performance Formula | ✅ | ❌ | ❌ |
| View Activity | All | Scoped | Limited |
| Submit Management Report | Optional | ✅ | ❌ |
| Review Admin Report | ✅ | ❌ | ❌ |
| View Global Analytics | ✅ | ❌ | ❌ |
| View Team Analytics | ✅ | ✅ | ❌ |
| View Personal Analytics | ✅ | ✅ | ✅ |
| Manage Inventory | ✅ | Scoped | ❌ |
| View Assigned Inventory | ✅ | ✅ | Own relevant |
| System Settings | ✅ | ❌ | ❌ |

`*` Final Chief operational permissions remain a client confirmation item.

---

## 11. Authentication

Required:

- login;
- logout;
- current user;
- forgot password;
- reset password;
- secure password/session handling;
- role validation;
- account-status validation.

Statuses:

```text
ACTIVE
INACTIVE
SUSPENDED
```

---

## 12. Core Modules

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
Inventory — Conditional
Settings
```

---

## 13. Task Model

Candidate task fields:

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

Additional fields must come from real Excel workflow analysis.

Priority:

```text
LOW
MEDIUM
HIGH
URGENT
```

---

## 14. Canonical Task Lifecycle

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

Exceptional terminal:

```text
CANCELLED
```

Overdue is initially derived:

```text
now > deadline
AND status NOT IN (COMPLETED, CANCELLED)
```

---

## 15. Task Rules

Allowed examples:

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

Forbidden examples:

```text
Member manually sets COMPLETED
Member approves own work
IN_PROGRESS → COMPLETED without review
Completed task silently returned to active work
```

---

## 16. Task Assignment

Assignment UI should expose:

```text
Member Name
Current Active Tasks
Overdue Tasks
Completion Rate
On-Time Completion Rate
Performance Score
Relevant Task History
```

Operix provides decision support; Admin makes the final assignment.

Automatic assignment is not MVP.

---

## 17. Work Queue

Operix may provide an unassigned queue organized by priority.

Admins may assign based on:

- priority;
- deadline;
- Member workload;
- performance;
- category;
- suitability.

Work Queue remains subject to workflow confirmation.

---

## 18. Submission & Review

Submission may contain:

```text
Task
Member
Submission Version
Submission Remarks
Supporting Files
Submitted At
```

Review actions:

```text
APPROVE
REQUEST_REVISION
```

Optional if business requires:

```text
REJECT
```

Previous submission versions must remain preserved.

---

## 19. Task History

Important events must remain traceable.

Example:

```text
10:02 Created
10:04 Assigned
10:31 Started
14:12 Submitted
14:30 Revision requested
15:02 Resubmitted
15:20 Approved / Completed
```

---

## 20. Activity Tracking

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

Activity fields:

```text
Actor
Action
Entity Type
Entity ID
Metadata
Timestamp
```

Optional technical metadata:
- IP;
- user agent;
- request id.

Never log secrets.

---

## 21. Core Activity Principle

```text
Business Action
→ Database Change
→ Activity Record
→ Notification if relevant
→ Analytics / Performance impact
→ Dashboard visibility
```

---

## 22. Performance Management

Potential metrics:

```text
Completion Rate
On-Time Completion Rate
Revision/Rejection Rate
Average Completion Time
Rework Rate
Task Complexity
Task Priority
Current Workload
Quality Rating
Consistency
```

Completed task count alone must not define performance.

Example weights are illustrative only:

| Metric | Example Weight |
|---|---:|
| Completion Rate | 30% |
| On-Time Completion | 25% |
| Quality / Review Score | 25% |
| Rework / Revision | 10% |
| Consistency | 10% |

Final formula is client-defined.

Performance records should be versionable if formulas change.

---

## 23. Workload Management

Workload indicators:

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

High performance does not equal high capacity.

---

## 24. Dashboards

### Super Admin

KPIs:
- Admins;
- Members;
- total tasks;
- pending;
- in progress;
- submitted/under review;
- completed;
- overdue;
- completion rate.

Analytics:
- task status;
- completion trend;
- workload by Admin;
- workload by Member;
- Member/team performance;
- overdue trend;
- productivity;
- report status;
- activity feed.

### Admin

KPIs:
- Members;
- assigned;
- pending;
- in progress;
- submitted for review;
- completed;
- overdue;
- team completion rate.

Analytics:
- Member performance;
- workload;
- task status;
- completion trend;
- revision rate;
- on-time completion.

### Member

KPIs:
- assigned;
- pending;
- in progress;
- submitted;
- revision required;
- completed;
- overdue.

Analytics:
- completion trend;
- completed vs pending;
- average completion time;
- on-time rate;
- workload;
- personal performance.

---

## 25. Analytics Architecture

```text
Database
→ Database / Backend Aggregation
→ Dashboard API
→ Frontend
→ Charts
```

Do not download entire task datasets just to calculate dashboard metrics client-side.

---

## 26. Dashboard API Baseline

```http
GET /api/v1/dashboard/overview
GET /api/v1/dashboard/task-status
GET /api/v1/dashboard/task-trends
GET /api/v1/dashboard/workload
GET /api/v1/dashboard/member-performance
GET /api/v1/dashboard/overdue
GET /api/v1/dashboard/activity
```

Responses must be viewer-scope aware.

---

## 27. Real-Time

Real-time is for important events:

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

Normal CRUD remains REST.

Potential transport:
- WebSocket;
- Socket.IO.

Real-time delivery failure must not invalidate a successfully committed database operation.

---

## 28. Notifications

Member:
- new task;
- deadline approaching;
- revision;
- feedback;
- approval/completion.

Admin:
- submission;
- resubmission;
- overdue;
- important Member activity.

Super Admin:
- Admin report;
- critical overdue;
- important organizational alert.

MVP:
```text
In-App
```

External channels remain future scope.

---

## 29. Reporting Model

### A. System-Generated Reports

Examples:
- Daily Workload
- Weekly Workload
- Monthly Workload
- Member Performance
- Admin Activity
- Task Completion
- Pending Tasks
- Overdue Tasks
- Revision/Rejection
- Workload Distribution

Filters:
- date;
- Admin;
- Member;
- status;
- priority;
- category;
- department/team.

Exports:
- Excel;
- PDF;
- CSV;

depending on requirements.

### B. Admin-Submitted Management Reports

Potential fields:

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

Candidate statuses:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
REVISION_REQUIRED
APPROVED
```

Final templates/cadence are pending client confirmation.

---

## 30. Excel Replacement & Migration

Migration flow:

```text
Existing Excel
→ Analyze Structure
→ Identify Sheets & Columns
→ Clean Data
→ Map Columns
→ Resolve Duplicates
→ Validate
→ Import
→ Verify
→ Operix Database
```

Example mapping:

| Excel Column | Operix |
|---|---|
| Staff Name | User |
| Work | Task |
| Assigned By | Task Assignment |
| Assigned To | Member / Assignment |
| Deadline | Task Deadline |
| Status | Task Status |
| Completed Date | Task Completion |
| Remarks | Submission / Review / Note |

After migration:

```text
Operix Database = Source of Truth
```

---

## 31. Inventory — Conditional

Potential scope:

```text
Product / Item
Category
Quantity
Stock In
Stock Out
Adjustment
History
Low Stock
Reports
Inventory-Related Tasks
Asset / Resource Assignment
```

Do not implement advanced inventory until the client confirms:
- what inventory is;
- quantity requirements;
- stock-in/out;
- assets;
- branches/warehouses;
- task linkage;
- batch/serial needs.

---

## 32. Core Data Entities

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

Final schema follows confirmed workflow + Excel structure.

---

## 33. Search / Filter / Sort

Search:
- Task ID;
- title;
- Member;
- Admin;
- employee ID;
- report;
- inventory item/SKU.

Filters:
- date;
- status;
- priority;
- Admin;
- Member;
- category;
- department;
- performance;
- overdue.

Sort:
- newest;
- oldest;
- deadline;
- priority;
- status;
- Member;
- performance;
- completion date.

---

## 34. File Management

Attachments may belong to:
- tasks;
- submissions;
- reports;
- profiles;
- inventory.

Store:
- name;
- MIME;
- size;
- storage reference;
- uploader;
- timestamp;
- related entity.

File limits remain pending.

---

## 35. Auditability

Preserve:
- assignment history;
- task state history;
- submissions;
- reviews;
- activity;
- performance history;
- report history;
- inventory transactions.

---

## 36. Non-Functional Requirements

### Security
- secure auth;
- backend RBAC;
- input validation;
- protected APIs;
- secure uploads;
- rate limiting;
- account status enforcement;
- audit logging.

### Performance
- pagination;
- indexes;
- efficient queries;
- backend aggregation;
- minimal unnecessary frontend processing.

### Scalability
Support growth in:
- users;
- tasks;
- submissions;
- logs;
- reports;
- notifications;
- performance;
- inventory.

### Reliability
Critical multi-write operations must persist consistently.

---

## 37. Technical Direction

Frontend:
```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
React Hook Form
Zod
Recharts
```

Backend:
```text
NestJS
TypeScript
Prisma
PostgreSQL
```

Auth candidate:
```text
Better Auth
```

Storage candidate:
```text
Cloudinary or S3-compatible
```

Backend flow:
```text
Route / Module → Controller → Service → Prisma → PostgreSQL
```

---

## 38. API Namespace

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

## 39. Requirement ID System

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

Core requirements include:

- active user authentication;
- account-status enforcement;
- Admin scope isolation;
- valid task state transitions;
- preserved submission versions;
- backend review authorization;
- structured activity generation;
- performance from actual work;
- system-generated reports;
- Admin-submitted reports;
- authorized analytics;
- in-app notifications.

---

## 40. Core Acceptance Criteria

### AC-001 — Assignment
Admin assigns a task to an authorized Member:
- task stored;
- assignment stored;
- Member can access;
- unauthorized users cannot;
- activity generated;
- notification generated;
- dashboard counters update.

### AC-002 — Submission
Member submits:
- submission stored;
- timestamp stored;
- task moves to review;
- history updated;
- activity generated;
- Admin notified.

### AC-003 — Revision
Admin requests revision:
- feedback stored;
- task enters `REVISION_REQUIRED`;
- Member notified;
- history preserved;
- resubmission allowed.

### AC-004 — Completion
Admin approves:
- review stored;
- task enters `COMPLETED`;
- completion time stored;
- activity generated;
- Member notified;
- performance/workload updated;
- dashboard counters update.

### AC-005 — Authorization Isolation
Admin A cannot access Admin B private Member/task/submission data.

### AC-006 — Overdue
Past-due non-completed/non-cancelled task appears as overdue in relevant views, reports, and analytics.

---

## 41. MVP Roadmap

### Phase 1
Authentication, RBAC, users, database, basic shell/dashboard.

### Phase 2
Task creation, assignment, status, submission, review, revision, approval, history, activity.

### Phase 3
KPIs, analytics, performance, workload, reports, filters, activity feed.

### Phase 4
Real-time events, notifications, dashboard counter updates.

### Phase 5
Excel analysis, cleaning, mapping, import, validation, export, PDF if required.

### Phase 6
Inventory only if confirmed.

### Phase 7
Advanced analytics/workload recommendations/predictive analysis.

---

## 42. Deferred Scope

Not MVP unless explicitly approved:

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
Native Mobile App
Biometric Integration
WhatsApp Automation
SMS Automation
External ERP Integration
```

---

## 43. Business Questions Before Development

Need client confirmation for:

### Organization
- number of Admins/Members;
- departments/teams/branches;
- multiple Admin relationships;
- Admin user-management permissions;
- Chief direct task actions.

### Tasks
- actual Excel fields;
- completion definition;
- approval responsibility;
- single/multiple assignees;
- decline/reassign/cancel;
- deadline changes;
- recurring work;
- rejection vs revision.

### Performance
- exact formula;
- priority/complexity effect;
- rating;
- reporting period;
- overrides.

### Reports
- exact templates;
- cadence;
- Chief review;
- Excel/PDF requirements.

### Inventory
- actual meaning;
- stock vs assets;
- quantity;
- stock-in/out;
- branches/warehouses;
- task linkage.

### Files
- types;
- max size;
- max count.

### Real-Time
- required events;
- live activity;
- external channels.

### Migration
- file/sheet count;
- historical depth;
- duplicates;
- status quality;
- task identifiers.

---

## 44. Development Lock Conditions

Before major domain implementation, confirm:

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

Do not invent missing business rules.

---

## 45. Final Product Architecture

```text
OPERIX
  ├── Users / Teams
  ├── Tasks / Assignments
  ├── Submissions / Reviews
  ├── Inventory — if required
  ↓
Activities
  ↓
Central Database
  ↓
Performance / Reports / Notifications / Analytics
  ↓
Dashboards / Real-Time Updates
  ↓
Management Decision
```

---

## 46. Product Positioning

**Operix**

**Full Title:** Pharmaceutical Workload & Operations Management Platform
**Short Description:** Smart Workforce, Task & Operational Management
**Tagline:** Operate. Track. Perform.

Development priority:

```text
Authentication
→ RBAC
→ Users / Teams
→ Task Assignment
→ Task Execution
→ Submission
→ Review / Revision
→ Activity Tracking
→ Performance
→ Reports
→ Analytics
→ Real-Time
→ Excel Migration
→ Inventory — if confirmed
```

Build trustworthy operational data before advanced charts.
