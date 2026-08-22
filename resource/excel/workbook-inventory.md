# Step 17A Workbook Inventory

Status: Step 17A complete, sanitized structural contract approved for Step 17B / 17C implementation

Real company workbooks must remain outside Git. This repository stores only sanitized structure, mapping, and synthetic fixture expectations.

## Required source files

Collect original, untouched workbook files for:

- Member / Staff
- Task / Workload
- Management Reporting
- Performance data
- Older workbook variants where the format changed

Do not clean, rename columns, remove sheets, unmerge cells, delete formulas, or normalize dates before analysis.

## Workbook inventory template

```text
Workbook ID:
Original filename:
Business purpose:
Owner / source department:
Approximate date range:
File size:
Workbook format:
Password protected:
Macro enabled:
External links:
Overall classification:
Notes:
```

## Sheet inventory template

```text
Workbook ID:
Sheet name:
Hidden:
Row count:
Column count:
Header row:
Normalized header sequence:
Merged cells:
Blank header cells:
Duplicate headers:
Formula cells:
Date cells:
Lookup / reference role:
Totals / subtotal rows:
Blank separator rows:
Multiple tables:
Sheet relationships:
Classification:
Notes:
```

Allowed sheet classifications:

```text
TASK_LEVEL_IMPORTABLE
MEMBER_LEVEL_IMPORTABLE
AGGREGATE_REPORTING_ONLY
REFERENCE_LOOKUP
UNSUPPORTED
```

## Workbook fingerprinting

Mapping profiles must identify workbook structure, not filename alone.

For every viable profile, record:

```text
sheet names
header row
normalized header sequence
expected required columns
optional columns
known lookup sheets
blocking structural issues
```

Approved Step 17B / 17C recognition behavior:

```text
filename
→ metadata only

required sheets + header row + normalized headers
→ profile recognition

headerOrder = ANY_ORDER
→ column order does not carry business meaning for approved V1 profiles
```

## Unknown column behavior

```text
required expected column missing
→ blocking

ambiguous or duplicate required column
→ blocking

extra unrelated column
→ warning / ignored

extra column that collides semantically
→ blocking
```

## Approved sanitized workbook structures

### MEMBER_LEGACY_V1

```text
Workbook purpose:
existing Member account enrichment preview

Required sheet:
Members

Header row:
1

Header order:
ANY_ORDER

Required columns:
Employee ID
Email
Team ID

Optional columns:
Name
Designation
```

### HISTORICAL_TASK_LEGACY_V1

```text
Workbook purpose:
terminal historical Task preview

Required sheet:
Tasks

Header row:
1

Header order:
ANY_ORDER

Required columns:
Task Reference
Title
Status
Team ID
Member Employee ID
Created By Email
Assigned By Email

Optional columns:
Description
Remarks
Priority
Created At
Assigned At
Started At
Due At
Completed At
Cancelled At
```

## Discovery checklist

- workbook dimensions and volumes
- hidden sheets
- merged cells
- formulas
- date cell behavior
- date and timezone conventions
- required versus extra columns
- Member identifiers
- Team identifiers
- Task identifiers
- status vocabulary
- priority vocabulary
- duplicate patterns
- missing data patterns
- aggregate only datasets
- unsupported structures
