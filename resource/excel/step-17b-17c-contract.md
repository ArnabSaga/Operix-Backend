# Step 17B / 17C Contract Draft

Status: Approved for Step 17B / 17C implementation

This document captures the approved implementation contract for spreadsheet infrastructure and stateless import preview / error reporting.

## Step 17 status

```text
Step 16 — Files + Attachments
✅ COMPLETE

Step 17 — Excel Import / Export
🟡 IN PROGRESS

Step 17A — Excel Intake + Mapping Discovery
✅ COMPLETE

Step 17B — Spreadsheet Infrastructure
🟢 IMPLEMENT NOW

Step 17C — Import Preview + Error Reporting
🟢 IMPLEMENT NOW

Step 17D — Historical Task Import
⛔ BLOCKED

Step 17E — Member Data Import
⛔ BLOCKED

Step 17F — Excel Exports
⛔ BLOCKED

Step 17G — Hardening + Documentation
⛔ BLOCKED
```

## Step 17B / 17C boundary

Do not add:

```text
src/modules/export/
ExportModule
Prisma models
migrations
export routes
business import execution
ImportBatch
ActivityLog
Notification
SMTP
```

unless a path already exists for an unrelated reason.

## Spreadsheet library decision

Approved package:

```text
SheetJS Community Edition 0.20.3
```

Installation:

```bash
pnpm add xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Do not install multiple overlapping spreadsheet libraries without demonstrated need.

## Step 17B infrastructure

Expected shape after approval:

```text
shared spreadsheet reader
shared spreadsheet writer
mapping profile recognizer
formula injection guard
temporary workbook processing
no FileAsset persistence for migration files
```

The writer must emit suspicious user controlled text as string cells, including values with leading spaces or tabs before:

```text
=
+
-
@
```

## Step 17C preview contract

Preview must perform zero business database mutations.

Expected pipeline:

```text
Workbook
→ parse
→ recognize profile
→ map
→ normalize
→ validate structure
→ validate rows
→ resolve DB references
→ detect duplicates/conflicts
→ preview
```

Expected summary shape:

```json
{
  "sourceRowCount": 900,
  "consideredRows": 842,
  "ignoredRows": 58,
  "candidateRows": 790,
  "candidateUpdateRows": 0,
  "alreadyPresentRows": 20,
  "invalidRows": 22,
  "conflictRows": 10,
  "warningCount": 4,
  "issueCount": 32,
  "canImport": false
}
```

Row issues should include:

```text
sheet
row
field
sourceValue
normalizedValue
errorCode
message
```

## Error report routes

```http
POST /api/v1/imports/members/error-report
POST /api/v1/imports/historical-tasks/error-report
```

Error reports are stateless and rerun the preview pipeline from the workbook.

## Import execution guarantee

Freeze the business guarantee:

```text
No silent partial success
```

Do not freeze the technical strategy yet:

```text
single atomic transaction
```

versus

```text
validated controlled batches
deterministic import identity
verification
```

Use real workbook volume to decide.

## Export architecture

Future exports must mirror data semantics and authorization.

Preferred architecture:

```text
Controller
   ↓
shared scoped domain query/calculator
   ↙                 ↘
REST response       XLSX projection
```

Do not call REST controllers internally from ExportService.

Excel must display Operix truth. It must not calculate business truth with formulas.
