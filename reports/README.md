# Reports

This directory contains tools and templates for batch report processing and cross-scan insights.

## Current Contents

- `SAMPLE_REPORT.md` — Example output from a scan run, useful as a reference for report structure

## Planned Features

The reporting module will support:

- **Batch Processing** — Ingest multiple `gemini-env-manifest.json` files from different team members or time periods
- **Trend Analysis** — Compare maturity scores, tool adoption, and skill coverage over time
- **Team Dashboards** — Aggregate insights across an organization's scan results
- **Export Formats** — Generate CSV, HTML, and PDF summaries from raw manifests

## Usage (future)

```bash
# Process all scan results in a directory
gemini-scanner report --input ./scan-results/ --output ./reports/

# Compare two scan snapshots
gemini-scanner diff --before scan-jan.json --after scan-apr.json
```

## Directory Convention

When the reporting feature is implemented, this directory will contain:

```
reports/
├── README.md          ← this file
├── SAMPLE_REPORT.md   ← reference output
├── lib/               ← reporting logic modules
│   ├── aggregator.js  ← batch manifest processing
│   ├── trends.js      ← time-series analysis
│   └── formatter.js   ← output format handlers
└── templates/         ← report templates (HTML, etc.)
```
