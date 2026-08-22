# Step 17F — Excel Exports Contract

Status: Implemented V1 XLSX system generated exports.

Step 17F is a read only export slice. Operix remains the source of truth. Excel workbooks are generated views of authorized Operix data.

## Endpoints

```text
GET /api/v1/exports/tasks
GET /api/v1/exports/performance/members
GET /api/v1/exports/performance/teams/:teamId
GET /api/v1/exports/dashboard/workload
GET /api/v1/exports/dashboard/trends
GET /api/v1/exports/management-reports
```

`format` defaults to `xlsx`. Only `xlsx` is supported.

Unsupported formats return:

```text
EXPORT_FORMAT_NOT_SUPPORTED
```

## Export boundary

Exports read canonical scoped data and calculators, project rows for XLSX, and return a buffer directly to the HTTP response.

They do not create:

```text
ActivityLog
Notification
FileAsset
Cloudinary asset
ExportJob
local file
SMTP email
```

There is no Prisma schema change or migration.

## Supported datasets

```text
Tasks
Member Performance
Team Performance
Dashboard Workload
Dashboard Trends
Management Reports
```

Dashboard Overview is intentionally not exported in this slice because it mixes UI KPIs with recent Activity and Notifications.

## Limits

```text
MAX_ROWS_PER_SHEET = 10,000 data rows
MAX_TOTAL_CELLS = 250,000 cells
```

Headers and data cells count toward total cells. Metadata rows do not count toward the per sheet data row limit.

Exports never silently truncate. If a dataset exceeds a limit, the API returns:

```text
EXPORT_LIMIT_EXCEEDED
```

Oversized text cells return:

```text
EXPORT_CELL_VALUE_TOO_LARGE
```

Unexpected writer failures return:

```text
EXPORT_GENERATION_FAILED
```

## Metadata

Every workbook includes a `Metadata` sheet with:

```text
Dataset
Schema Version
Generated At
As Of
Timezone
Viewer Role
Viewer ID
Effective Scope
Effective Filters
```

`Generated At` and `As Of` use the same captured timestamp in V1, but remain separate fields.

Timezone is always:

```text
UTC
```

Metadata is human readable. It must not expose Prisma predicates, SQL, session data, or internal authorization objects.

## Typed cell rules

```text
string
→ formula safe text cell

number
→ numeric cell

Date
→ Date cell

boolean
→ boolean cell

null / undefined
→ blank cell
```

Business metrics are calculated by Operix before export. Excel must not contain business formulas.

Formula like user text is neutralized as text. Real negative numeric values remain numeric cells.

## Authorization

Exports never grant more access than the corresponding REST data.

```text
Tasks
→ SUPER_ADMIN all
→ ADMIN scoped Team Tasks
→ MEMBER current assignment Tasks

Member Performance
→ SUPER_ADMIN / ADMIN only

Team Performance
→ SUPER_ADMIN / ADMIN only

Dashboard Workload
→ SUPER_ADMIN / ADMIN / MEMBER role specific data

Dashboard Trends
→ SUPER_ADMIN / ADMIN / MEMBER role specific data

Management Reports
→ SUPER_ADMIN all
→ ADMIN own authored reports
```

Management Report Admin export preserves historical authorship through `ManagementReport.adminId`.

## Deferred

```text
CSV
PDF
stored exports
scheduled exports
email delivery
custom columns
Dashboard Overview export
export history
```
