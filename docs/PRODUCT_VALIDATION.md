# Graph Chat v0.2.0 product validation

Graph Chat records validation events only in its local SQLite database. Nothing is
uploaded automatically.

## Primary metrics

1. **Activation rate**: eligible graphs that contain both a synthesis and an
   evidence-backed conclusion.
2. **Seven-day return rate**: eligible graphs reopened at least seven days after
   their first recorded open.
3. **Evidence coverage**: conclusions with a summary and at least two distinct
   incoming evidence nodes, divided by all conclusions.

An eligible graph has at least one imported source or one user-created branch.
This excludes untouched example and empty graphs from the denominator.

## Drivers and guardrails

- Time to first branch and first synthesis diagnose activation friction.
- Distinct local sessions distinguish reopening from repeated events in one tab.
- Completed, cancelled, and failed runs measure reliability.
- Helpful rate measures rated answers only; unrated answers are not negative feedback.

## Privacy contract

The local event table uses an anonymous per-tab session ID for aggregation.
The downloadable report contains only graph IDs, timestamps, counts, durations,
versions, and ratios; it does not expose session IDs. It excludes prompts,
generated content, titles, source URLs, credentials, and imported source material.

Inspect or download the report from **Learning workspace -> Product validation**,
or request `/api/validation/export.json`.

## Pilot procedure

Recruit 8-12 target users. Ask each participant to use their own material and:

1. import or paste a source;
2. create at least one explanatory branch;
3. compare and synthesize two branches;
4. mark a summarized, evidence-backed node as a conclusion;
5. return to the same graph at least seven days later.

Review the exported report weekly. Do not combine reports across participants
without explicit consent. Initial targets are provisional until a baseline exists:

- activation rate >= 60%;
- median time to first synthesis <= 20 minutes;
- evidence coverage >= 70%;
- seven-day return rate >= 30%;
- failed-run rate <= 5%.
