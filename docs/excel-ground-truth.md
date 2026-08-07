# Excel Ground Truth — Ali Public School Timetable

Source file: `2025-2026_Time_Table_Master_File_Scenarios.xlsx` (the school's master Excel timetable, given by the school contact). Everything in this doc was verified directly from the file's *computed values* — not from its formulas (many of which are broken/chained in fragile ways) and not from guessing. Anything that couldn't be verified is explicitly marked below and in `verification_needed.json`, rather than filled with a plausible-looking number.

## Campuses
- **Junior** — Pre-Nursery, Nursery A/B/C, KG A/B/C. Simple, static, one homeroom teacher per section, no formula logic involved at all.
- **Girls Campus** — Grades 1–10.
- **Boys Campus** — Grades 4–10 + a college section (11/12).

## Period timings

### Nursery & KG (identical for both)
| Period | Start | End |
|---|---|---|
| 1 | 08:15 | 08:55 |
| 2 | 09:00 | 09:40 |
| 3 | 09:45 | 10:25 |
| 4 | 10:25 | 11:05 |
| 5 | 11:05 | 11:35 |
| 6 | 11:40 | 12:10 |
| 7 | 12:15 | 12:45 |

### Classes 1–8 (Girls & Boys, same timing)
| Period | Start | End |
|---|---|---|
| 1 | 08:15 | 08:55 |
| 2 | 09:00 | 09:40 |
| 3 | 09:45 | 10:25 |
| 4 | 10:25 | 11:00 |
| 5 | 11:00 | 11:40 |
| 6 | 11:45 | 12:25 |
| 7 | 12:30 | 13:00 |

### Classes 9 & 10 (Girls & Boys, same timing) — no break
| Period | Start | End |
|---|---|---|
| 1 | 08:15 | 08:55 |
| 2 | 09:00 | 09:40 |
| 3 | 09:45 | 10:25 |
| 4 | 10:30 | 11:10 |
| 5 | 11:15 | 11:55 |
| 6 | 11:55 | 12:30 |
| 7 | 12:30 | 13:00 |

**Known gap (unresolved):** for Nursery/KG/Classes 1–8, the source file never states the break's real duration — Period 4's listed end-time equals Period 5's listed start-time, which only makes sense if zero minutes were reserved for the break the sheet labels right after Period 4. Period 4 itself is confirmed to be a real teaching period (e.g. Class 1A's Period 4 is "Games" every weekday, not blank). **A 15-minute break is currently used as a placeholder assumption — get the real duration from the school and adjust.**

**Saturday & Sunday:** confirmed fully off, for every single class, in every campus, with zero exceptions found anywhere in the file.

## Girls Campus — class status

**Confirmed working** (real subject+teacher data exists for every weekday; full grid in `girls_full_grid.json`):
`1A, 1B, 2A, 2B, 3A, 4A, 5A, 6A, 7A, 8A, 9A, 10A`

**Broken in source** (the formula chain returns `#N/A` for almost every period — this could mean a genuinely real class whose Excel record broke at some point, or a section that was never actually used; can't tell which from the file alone):
`1C, 2C, 3B, 3C, 4B, 5B, 6B, 7B, 8B, 9B, 10B`

**Empty placeholder** (zero data anywhere — looks like it was copy-pasted from the Boys sheet template and never actually used for Girls):
`11 Medical, 11 CS`

## Boys Campus — class status

**Confirmed working** (periods-per-week per subject extracted in `boys_classsubject.json`):
`4A, 4B, 5A, 6A, 7A, 8A, 9A, 10A`

`6B` has a confirmed curriculum requirement (identical to 6A's), but its actual day-by-day teacher/period assignment is broken in the source — that's fine, filling in 6B's real day-by-day schedule is exactly what the Auto-Generate Timetable feature is for.

**Confirmed empty** (zero periods anywhere in the file):
`5B, 7B, 8B, 9B, 10B`

**Not a real class — don't create it:** Grade 3 (`3A`/`3B`) only appears inside a couple of individual teachers' subject-eligibility lists. It never shows up as an actual scheduled class anywhere — absent from both of the workbook's own official class-listing views.

**Needs school confirmation — genuinely inconsistent inside the file itself:**
- College section naming/structure: one part of the workbook lists `11 Medical / 11 Engineering / 11 CS / 12 CS`, another part of the same workbook just uses generic `1st Year / 2nd Year` labels with different subject sets. `12 Medical` and `12 Engineering` (which appeared in an earlier seed draft) have **no supporting data anywhere** in the file — do not add them until confirmed.
- Boys `9A`/`10A` "Games" periods/week could not be reliably extracted — the two different parts of the sheet that should agree on this number don't.

## Files in this folder
- `girls_full_grid.json` — complete Monday–Friday × Period 1–7 subject + teacher grid for the 12 confirmed Girls classes. **Not committed to git** (see note below) — you won't find this file in a fresh clone.
- `boys_classsubject.json` — periods-per-week per subject for the 9 confirmed Boys classes
- `verification_needed.json` — machine-readable version of every "ask the school" item above, for whatever tool/script needs to check against it programmatically

## A note on real personal data (2026-08-01)
Three files that contain real teacher names are deliberately **kept local-only and excluded from git** (see the repo-root `.gitignore`), not because they're unimportant, but because once real personal data enters git history it's very hard to fully remove later, even after deleting the file — and "the repo is private" isn't a permanent guarantee:
- `2026-2027 Time Table Master File Scenarios v2.xlsx` (repo root) — the raw source file from the school
- `ALI PUBLIC SCHOOL - STRUCTURE & TEA.txt` (repo root) — another raw source doc from the school
- `docs/girls_full_grid.json` (this folder) — derived from the Excel file, but still carries real teacher names in its `teacher` fields

None of these are needed to actually run the app (they're reference/provenance material, not application data). If a new developer needs them, get them via a private channel (not git) — ask Abdullah directly.
