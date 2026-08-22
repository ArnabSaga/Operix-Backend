# Unsupported Excel Structures

Status: Active discovery document

This file records workbook structures that should not become import mappings unless a later product decision approves them.

## Unsupported by default

```text
password protected workbooks
encrypted workbooks
macro enabled workbooks
workbooks requiring formula execution
external links that must be resolved
unknown formulas that determine business truth
files without stable Member identity
files without stable Task identity for historical Task import
aggregate only rows used as synthetic Task sources
ambiguous Team mappings
name only Member matching
```

## Aggregate reporting only

Sheets like this must not populate `Task`:

```text
Employee | Month | Completed | Pending
Team     | Month | Total Work | Overdue
```

Classify them as:

```text
AGGREGATE_REPORTING_ONLY
```

They may later be useful for reconciliation or historical reporting, but they do not provide task level operational truth.

## Unsupported structure log

| Workbook | Sheet | Classification | Reason | Possible future use |
| --- | --- | --- | --- | --- |
| Unresolved | Unresolved | UNSUPPORTED | Real workbook required | Unresolved |

## Ambiguity rules

Unknowns must remain explicit.

Do not guess:

```text
date format
timezone
Member identity
Team mapping
Task identity
status aliases
priority aliases
duplicate handling
chronology repairs
```

## Formula safety

Import must not let Excel formulas determine Operix truth.

Future export must protect against formula injection. User controlled or database text beginning with dangerous spreadsheet markers must be written as text cells, including values where spaces or tabs appear before:

```text
=
+
-
@
```

The actual writer behavior belongs to Step 17B.
