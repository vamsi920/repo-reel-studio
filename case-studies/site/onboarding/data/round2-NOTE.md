Round 2 (2026-10-13). Valid: S1-northwind-bank, S5-return-visit.
S2 crashed (browser page crash under memory pressure). S3 and S4 ran on the
same test org after S1/S5 and inherited the bank's saved facts (memory is
per org), so they do not measure what they were meant to; the harness now
resets the org between scenarios (harness/reset-org.mjs). Kept for the
fake-receipt and invented-assignee findings only.
