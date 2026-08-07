# APS Timetable System — Master Specification (v2)
_Reverse-engineered from two source files the school provided, plus direct confirmation from the school (the school admin, APS). This supersedes the v1 spec. Written for an engineering agent (Claude Code) to implement against. **Both source files will be placed in the project root** — read them directly rather than relying solely on the tables below, which are a snapshot and may drift._

**Source files (place in repo root):**
- `2026-2027_Time_Table_Master_File_Scenarios_v2.xlsx` — the school's working Excel file
- `ALI_PUBLIC_SCHOOL_-_STRUCTURE_AND_TEACHERS.txt` — real section counts + full teacher roster, typed directly by the school (the school admin) in response to a verification request. **Treat this as the more authoritative source for section counts and current teacher roster** — see §2 and §6 for why.

---

## 0. IMPORTANT — data status: ✅ ALL CONFIRMED, ready to seed

This project went through several rounds of data-gathering with the school. **As of this version, every open conflict has been resolved and directly confirmed by the school** (see §2, §5, §6, §8, §14 for the confirmed values). What follows is a record of what was stale/conflicting and how it was resolved — useful context, but no longer blocking.

1. **The v2 Excel file is only partially updated** and should not be trusted blindly. Sheet names show it directly: `Junior Timetable 2026_27`, `Junior Detailed 2026_27`, and `Girls Detailed 2026_27` were refreshed for the new year — but `Girls Timetable 2023-24`, `Boys Timetable 2023-24`, `Boys Detailed 2023_24`, `Girls Campus Tutors`, and `Boys Campus Tutors` **still carry last year's stale data**. Use the confirmed values in this spec (§2, §5, §6) over anything conflicting in those stale sheets.
2. **The currently-running WebAdmin database is still seeded with placeholder/test data** — the dashboard shows 57 teachers / 52 classes with fake entries ("ahmad", "ai sir", "abdullah@..."). **This should now be wiped and reseeded with the confirmed real data** — nothing is blocking this anymore.
3. Where this document previously showed two conflicting numbers side-by-side, they have now been resolved to a single confirmed value — look for ✅ markers throughout.

---

## 1. Source File Structure — 9 Excel Sheets

| Sheet | Status | Purpose |
|---|---|---|
| `Junior Timetable 2026_27` | ✅ refreshed | Weekly timetable blocks, Pre-Nursery/Nursery/KG |
| `Girls Timetable 2023-24` | ⚠️ stale | Weekly timetable, Girls — 3 views (Per-Teacher/Per-Class/Per-Period) |
| `Boys Timetable 2023-24` | ⚠️ stale | Same, Boys |
| `Junior Detailed 2026_27` | ✅ refreshed | Raw block form of Junior timetable |
| `Girls Detailed 2026_27` | ✅ refreshed | Validation engine: actual vs target period-counts, FINE/ERROR flags — **this sheet's teacher list and class list were updated, but not fully reconciled with the school's separately-typed numbers (see §2, §6)** |
| `Boys Detailed 2023_24` | ⚠️ stale | Same concept, Boys — has extra "Islamiat for CS"/"Urdu for CS" adjustment-tracking columns (see §11) |
| `Girls Campus Tutors` | ⚠️ stale — do not use | Old roster; superseded by §6 |
| `Boys Campus Tutors` | ⚠️ stale — do not use | Old roster; superseded by §6 |
| `Classes Timinings` | ⚠️ superseded | Old per-level bell schedule; **replaced entirely by the simple rule in §3**, confirmed directly by the school |

---

## 2. School Structure & Section Counts — ✅ CONFIRMED by the school (the school admin)

- **Campuses:** Junior, Girls, Boys.
- **Girls campus extends beyond Class 10** into one active college-level stream: **"11 Medical"** (this is what the school's "Ist Year" refers to). **"11 CS" exists in the Excel as a future-planning placeholder only — no admissions are currently happening for it.** Do not seed it as an active class; the school may expand to a 3-stream setup (Medical, CS, Engineering) later, but not now.

### Confirmed final section counts

| Group | Sections |
|---|---|
| Junior | 8 (Pre-Nursery 2, Nursery 3, KG 3) |
| **Girls** | **14**: Class1=2(A,B), Class2=3(A,B,C), Class3=1(A only), Class4–10=1 each (A only, 7 classes), Ist Year/11 Medical=1 |
| Boys | 11 (Class3=1, Class4–6=2 each, Class7–10=1 each) |
| **Total** | **33** |

**Why the Excel showed more sections than this (resolved):** the Excel's `Girls Detailed 2026_27` sheet had fully-populated quota data for Class 1's "C" row and Class 3's "B"/"C" rows, which looked like real active sections. **The school confirmed directly these are stale leftover rows, not real sections** — Class 1 is genuinely 2 sections and Class 3 is genuinely 1. **When seeding, only create ClassSection rows for the confirmed list above — do not seed Class 1C, Class 3B, Class 3C, or "11 CS", even though the Excel has quota data sitting in those rows.**
## 3. Daily Period Structure — simplified, directly confirmed by the school

This **replaces** the old per-level bell-schedule table entirely (Nursery/KG/Classes1-8/Classes9-10 no longer have different timings — the school confirmed one uniform rule):

> **Monday–Thursday:** every period is 40 minutes; Break is 20 minutes.
> **Friday:** every period is 35 minutes; Break is 20 minutes.
> This applies the same way to every level and every class — **no exceptions**.

This also resolves two previously-open questions from the v1 spec:
- **Break duration:** now known — 20 minutes, every day, for everyone.
- **Do Classes 9–10 get a Break?** Yes — the "No Break" note found in the old `Classes Timinings` sheet for Classes 9–10 is superseded by this confirmation; every class gets the same 20-minute break.

The 7-lecture-periods + 1-break daily structure (from the v1 analysis) still holds — only the clock-minutes changed, not the count of periods.

---

## 4–5. Subject Catalog & Weekly Quota per Class

Source: `Girls Detailed 2026_27`, "Target classes per subject" block (column layout unchanged from v1: `CC:CP` = actual, `CR:DE` = target, `DG:DT` = delta).

| Class | English | Urdu | Islamiat | Maths | Science | Physics | Chem | Bio | Geo/SS | Comp Sci | History | R/W | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1A/1B/1C | 5 | 5 | 5 | 5 | 5 | – | – | – | 2 | – | – | 3 | 30 |
| 2A/2B/2C | 5 | 5 | 5 | 5 | 5 | – | – | – | 2 | – | – | 3 | 30 |
| 3A/3B/3C | 5 | 5 | 5 | 5 | 5 | – | – | – | 2 | – | – | 3 | 30 |
| 4A | 5 | 4 | 3 | 5 | 5 | – | – | – | 2 | 3 | – | 3 | 30 |
| 5A | 5 | 4 | 3 | 5 | 5 | – | – | – | 5 | 3 | – | – | 30 |
| 6A | 5 | 4 | 3 | 5 | 5 | – | – | – | 3 | 3 | 2 | – | 30 |
| 7A | 5 | 4 | 3 | 5 | 5 | – | – | – | 3 | 3 | 2 | – | 30 |
| 8A | 5 | 4 | 3 | 5 | – | 4 | 4 | 4 | 3 (Pak Study) | – | – | – | 32 |
| 9A | 5 | 3 | 3 | 5 | – | 5 | 5 | 5 | 3 (Pak Study) | – | – | – | 34 |
| 10A | 5 | 3 | 3 | 5 | – | 5 | 5 | 5 | 3 (Pak Study) | – | – | – | 34 |
| **11 Medical** (new) | 5 | 5 | 5 | – | – | 5 | 5 | 5 | – | – | – | – | 30 |
| **11 CS** (new) | 5 | 5 | 5 | 5 | – | 5 | – | – | – | 5 | – | – | 30 |

Add Games (not tracked in this table, but real and observed in actual weekly timetables — see v1 findings: 5/week for Classes 1–7, 3/week for Class 8, 1/week for Classes 9–10) to reach 35 total/week for Classes 1-10. Games frequency for the new "11 Medical"/"11 CS" streams is not yet known — flag for the school.

### ✅ CONFIRMED: "Pak Study" is the real subject for Classes 8–10, not "Geography/SS"

The school confirmed directly: the actual subject taught for Classes 8, 9, and 10 is **Pak Study**. The Excel's "Geography/SS" label in that column is a leftover artifact from reusing an older template file — it does not reflect the real subject. **Seed this as "Pak Study" in the database, not "Geography/SS," for Classes 8–10.** (Classes 1–7 genuinely use "Geography/SS" as their subject — this change applies only to Classes 8–10.) **This rename applies to both Girls and Boys campuses.**

---

## 5b. Boys Campus — Weekly Subject Quota per Class — ✅ CONFIRMED (extracted directly from `Boys Timetable 2023-24`, sheet 3, per-class view; matches the confirmed 11 active sections exactly)

| Class | English | Urdu | Islamiat | Maths | Science | Physics | Chem | Bio | Geo/SS→Pak Study(8-10) | Comp Sci | History | R/W | Games | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3A | 5 | 5 | 5 | 5 | 5 | – | – | – | 2 | – | – | 3 | 5 | 35 |
| 4A | 5 | 4 | 3 | 5 | 5 | – | – | – | 2 | 3 | – | 3 | 5 | 35 |
| 4B | 5 | 4 | 3 | 5 | 5 | – | – | – | 2 | 3 | – | 3 | 5 | 35 |
| 5A | 5 | 4 | 3 | 5 | 5 | – | – | – | 5 | 3 | – | – | 5 | 35 |
| 5B | 5 | 4 | 3 | 5 | 5 | – | – | – | 5 | 3 | – | – | 5 | 35 |
| 6A | 5 | 4 | 3 | 5 | 5 | – | – | – | 3 | 3 | 2 | – | 5 | 35 |
| 6B | 5 | 4 | 3 | 5 | 5 | – | – | – | 3 | 3 | 2 | – | 5 | 35 |
| 7A | 5 | 4 | 3 | 5 | 5 | – | – | – | 3 | 3 | 2 | – | 5 | 35 |
| 8A | 5 | 4 | 3 | 5 | – | 4 | 4 | 4 | 3 (Pak Study) | – | – | – | 3 | 35 |
| 9A | 5 | 3 | 3 | 5 | – | 5 | 5 | 5 | 3 (Pak Study) | – | – | – | 1 | 35 |
| 10A | 5 | 3 | 3 | 5 | – | 5 | 5 | 5 | 3 (Pak Study) | – | – | – | 1 | 35 |

Identical structure/pattern to Girls campus.

---

## 5c. Junior Campus — Weekly Subject Quota per Class — ✅ CONFIRMED (extracted directly from `Junior Timetable 2026_27`, sheet 1; matches all 8 confirmed sections)

| Section | Subjects (periods/week) | Total |
|---|---|---|
| Pre-Nursery A, B | English5, Maths5, Urdu5, Games10, Activity5, Diary5 | 35 |
| Nursery A, B, C | English4, Maths5, Urdu4, Games5, English(R/W)3, Diary5, Isl/GK5, Urdu(R/W)2, WRA2 | 35 |
| KG A, B, C | English4, Urdu4, Maths5, Diary5, Games5, English(R/W)3, Isl/GK5, Urdu(R/W)2, WRA2 | 35 |

Note: Pre-Nursery gets Games twice daily (10/week total); Nursery/KG get it once daily (5/week) — matches the original v1 finding. "WRA" appears as a real, confirmed subject (2 periods/week, Friday) rather than needing further explanation of its meaning — it's simply part of the curriculum as-is.

---

## 6b. Junior Campus — Teacher Roster — ✅ CONFIRMED (whole-class model, not subject-specialist)

Unlike Girls/Boys (subject specialists across many classes), **each Junior teacher teaches every subject to one assigned section** — a homeroom model.

| Section | Teacher |
|---|---|
| Pre-Nursery A | Junior Teacher 1 |
| Pre-Nursery B | Junior Teacher 2 |
| Nursery A | Junior Teacher 3 |
| Nursery B | Junior Teacher 4 |
| Nursery C | **TBH (to be hired)** |
| KG A | Junior Teacher 5 |
| KG B | Junior Teacher 6 |
| KG C | Junior Teacher 7 |

7 hired + 1 TBH = 8 total, one per section — cross-validated directly against the Excel's own teacher-name column in `Junior Timetable 2026_27`, which matches exactly.

**Schema implication:** unlike Girls/Boys `TeacherSubject(teacher, subject, class)` triples, Junior teachers simply need `TeacherSubject` rows for *every* subject in their section's quota (§5c) — since they teach all of it. Model it the same way (one row per teacher-subject-class), just auto-generate all rows for a Junior teacher rather than expecting the school to enumerate each one.

---

## 6. Teacher Roster — use the school's typed document as the source of truth

The Excel file's `Girls/Boys Campus Tutors` sheets are confirmed stale even in the v2 file (still list last year's teachers). **The roster below, typed directly by the school, is the one to seed from.**

### Girls Campus — 12 hired + 4 "to be hired" = 16 total

| Teacher | Subject(s) | Classes | Status |
|---|---|---|---|
| Girls Teacher 1 | Urdu | 4,5,6,7,8,9,10 | Hired |
| Girls Teacher 2 | Maths | 5,6,7,8,9,10 | Hired |
| Girls Teacher 3 | Science | 1A,1B,2A,2B,2C,3 | Hired |
| Girls Teacher 4 | Geography/SS, History | 5–10 | Hired |
| Girls Teacher 5 | Geography/SS, Reading & Writing | 1A,1B,2B,2C | Hired |
| Girls Teacher 5 | Chemistry | 8,9 | (same person, 2nd subject) |
| Girls Teacher 6 | Islamiyat | 5 – Ist Year | Hired |
| Girls Teacher 7 | Maths | 1B,2A,2B,2C,3,4 | Hired |
| Girls Teacher 8 | Islamiat | 1A,1B,2A,2B,2C,3 | Hired |
| Girls Teacher 9 | Urdu | 1A,1B,2A,2B,2C,3 | Hired |
| Girls Teacher 10 | English | 1A,1B,2A,2B,2C,3 | Hired |
| Girls Teacher 11 | Biology | 8,9,10 | Hired |
| Girls Teacher 11 | Science | 5,6,7 | (same person, 2nd subject) |
| Girls Teacher 12 | Computer Science | 4,5,6,7 | Hired |
| Girls Teacher 12 | Maths | 1A | (same person, 2nd subject) |
| Girls Teacher 12 | Geography/SS, Reading & Writing | 2A | (same person, 3rd subject) |
| **"Miss TBH"** | English | 7,8,9,10, Ist Year | **To be hired** |
| **"Miss TBH"** | Urdu | Ist Year | **To be hired (may be same vacancy as above, unclear)** |
| **"Miss TBH1"** | English | 4,5,6 | **To be hired** |
| **"Miss TBH1"** | Geography/SS, Reading & Writing | 3,4 | (same vacancy, 2nd subject) |
| **"Miss TBH1"** | Islamiat | 4 | (same vacancy, 3rd subject) |
| **"Miss TBH2"** | Physics | 8,9,10, Ist Year | **To be hired** |
| **"Miss TBH2"** | Chemistry | 10 | (same vacancy, 2nd subject) |
| **"Miss TBH2"** | Science | 4 | (same vacancy, 3rd subject) |
| **"Miss TBH3"** | Biology, Chemistry | Ist Year | **To be hired** |

**Note:** the school's document counts this as "12 hired + 4 to-be-hired = 16 total" — matching 4 distinct TBH placeholder identities (TBH, TBH1, TBH2, TBH3) above, each covering multiple subjects/classes for their eventual hire. **✅ Confirmed by the school: "Miss TBH" (English, higher classes 7-10 + Ist Year) and "Miss TBH1" (English, middle classes 4-6) are two separate, real vacancies — not the same position listed twice.**

### Boys Campus — 12 hired + 1 "to be hired" = 13 total

| Teacher | Subject(s) | Classes | Status |
|---|---|---|---|
| Boys Teacher 1 | Maths | 6A,6B,7,8,9,10 | Hired |
| Boys Teacher 2 | Chemistry, Biology | 8,9,10 | Hired |
| Boys Teacher 3 | Urdu | 6A,6B,7,8,9,10 | Hired |
| Boys Teacher 4 | Islamiyat | 3,5B,6A,6B,7,8,9,10 | Hired |
| Boys Teacher 5 | Geography/SS, History, Reading & Writing | 4A,4B,6A,6B,7,8 | Hired |
| Boys Teacher 6 | English | 4A,4B,5A,5B,6A,6B | Hired |
| Boys Teacher 7 | Urdu | 3,4A,4B,5A,5B | Hired |
| Boys Teacher 8 | Maths | 3,4A,4B,5A,5B | Hired |
| Boys Teacher 8 | Islamiyat | 5A | (same person, 2nd subject) |
| Boys Teacher 9 | Physics | 8,9,10 | Hired |
| Boys Teacher 9 | Science | 6B,7 | (same person, 2nd subject) |
| Boys Teacher 10 | Science | 3,4A,4B,5A,5B,6A | Hired |
| Boys Teacher 11 | Computer Science | 4A,4B,5A,5B,6A,6B,7 | Hired |
| Boys Teacher 12 | English | 3,7,8,9,10 | Hired |
| Boys Teacher 12 | Islamiyat | 4A,4B | (same person, 2nd subject) |
| **"Sir TBH"** | Geography/SS, Reading & Writing | 3,5A,5B,9,10 | **To be hired** |

**Cross-reference note:** class labels here use "5B", "6A", "6B" etc. even though the school's section-count document says Class 5/6 have 2 sections (A,B) for Boys, which is internally consistent — but Class 3 shows both "3" (no letter) here and "1 section (A only)" in §2, suggesting the unlabeled "3" = "3A". Minor labeling inconsistency, not a data conflict — just confirm the label convention with the school.

---

## 7. Teacher Workload Rule (unchanged from v1)

Every teacher's target is a fixed **30 lectures/week**, regardless of how many subjects/classes they cover. This still applies — confirmed independently across multiple teachers in the original Excel analysis, and structurally consistent with the new roster (e.g. Girls Teacher 12's 3 different subject/class combinations should sum toward one shared 30/week target, not 30 each).

---

## 8. Subject Priority — ✅ FULLY CONFIRMED by the school

Two different rules apply depending on how often the class gets Games:

**Group A — Games scheduled frequently (daily or near-daily): Classes 1–7 and "11 Medical"**
- Periods 1–3: core subjects (Science, Maths, English for Classes 1-7; English/Urdu/Islamiat/Biology/Chemistry/Physics rotate in for 11 Medical)
- **Period 4: reserved for Games** (a fixed, specific slot — not just "somewhere in the light tier")
- Periods 5–7: lighter subjects (Geography/SS or Pak Study, Urdu, Islamiat, Computer Science, Reading/Writing)

**Group B — Games scheduled rarely (once/week): Classes 8, 9, 10**
- Periods 1–4: core subjects (Physics, Chemistry, Biology, Maths, English) — no fixed Games slot needed since Games isn't daily here
- Periods 5–7: lighter subjects (Computer Science, Urdu, Islamiat, Pak Study, and Games on its one day/week)

**Final tier assignment for the engine:**
| Subject | Tier |
|---|---|
| Science, Maths, English, Physics, Chemistry, Biology | CORE_EARLY (Periods 1–4, or 1–3 + a dedicated Period-4-Games slot for Group A classes) |
| Games | Fixed to Period 4 for Group A classes; LIGHT_LATE (any of Periods 5–7) for Group B classes |
| Urdu, Islamiat, Geography/SS (Classes 1-7), Pak Study (Classes 8-10), Computer Science, Reading/Writing, "WRA" (KG), **History (Classes 6-7)** | LIGHT_LATE (Periods 5–7) |

**✅ CONFIRMED — History:** same tier as Geography/SS (LIGHT_LATE), and the school suggested they can even **share the same period slot on alternating days** (e.g. Mon-Wed = Geography, Thu-Fri = History, same period number) — same slot-sharing pattern already used for Geography/SS vs Reading/Writing in Classes 1-3. **Not compulsory** — the solver can place them independently within LIGHT_LATE if that's simpler; slot-sharing is a nice-to-have, not a requirement.

**✅ CONFIRMED — priority tier is a strong preference, not a hard rule** (matches what's already implemented): "we know it's not possible for each teacher to take early period... wherever possible, and especially in lower classes, focus on major subjects like English/Science/Maths earlier in the day." **No further engine change needed — the existing soft-preference implementation (item 6 in `PENDING_QUESTIONS.md`) is confirmed correct as the final design, not just an interim fix.**

**Important implementation note, directly from the school:** because one teacher often covers a subject across many sections (e.g. a Science teacher across 6 different sections), **not every section's lecture for a given subject can literally land in Period 1** — the teacher can only be in one place per period. This is fully compatible with the CORE_EARLY *window* design (a subject is allowed anywhere in Periods 1–4, not pinned to exactly Period 1) — the constraint solver naturally distributes different sections' lectures for the same teacher across the available early periods and across the week. No softening of the constraint is needed; this is just an explanation of why the schedule will show some sections' core subjects at Period 2, 3, or 4 rather than all at Period 1.

Every teacher must still reach their full 30/week load. **De-prioritized, per client:** automatic absence/substitute-teacher backup logic — not required for v1.

---

## 9. Known Data Inconsistencies — updated status: ALL RESOLVED

1. v2 Excel is only partially refreshed — several sheets are still last year's stale data (§1). _Still true, not resolvable by the school — just a fact of the source file; use the confirmed values in this spec over the stale sheets._
2. ✅ **Resolved:** section counts are now confirmed at Junior=8, Girls=14, Boys=11 (§2). The Excel's extra rows (Class 1C, Class 3B/3C, 11 CS) are confirmed stale/inactive — exclude them from seeding.
3. ✅ **Resolved:** Geography/SS vs Pak Study — Classes 1-7 use Geography/SS, Classes 8-10 use Pak Study; Excel's blanket label is a legacy artifact (§5).
4. ✅ **Resolved:** "Miss TBH" and "Miss TBH1" are two separate real vacancies, not one (§6).
5. ✅ **Resolved:** Boys Class 3 is 1 section ("3" = "3A").
6. ✅ **Resolved:** subject priority tiers, including the Period-4-Games rule (§8).
7. ✅ **Resolved:** KG's Friday "WRA" is an IQ-building subject, not a revision/test period.
8. The currently-running WebAdmin database is still seeded with placeholder/test data (§0) — needs reseeding now that everything above is confirmed.

---

## 10. The "Adjustment" Mechanism (unchanged concept from v1)

`Boys Detailed` sheet has "Islamiat for CS" / "Urdu for CS" columns tracking how a teacher's shortfall in one subject is patched with periods from another subject they're also qualified for, so their total still reaches 30. **Design implication unchanged:** the engine should let a teacher's 30/week target be filled by any combination of their eligible subject-classes, not force a single subject to reach 30 alone. The new roster (§6) already reflects this pattern directly — e.g. Girls Teacher 12 covers 3 different subject/class combinations that together should sum to 30.

---

## 11. Proposed Database Schema (extended from v1)

```
Campus         (id, name)                              -- Junior / Girls / Boys
Level          (id, name, campus_id)                    -- Nursery, KG, Class 1 ... Class 10, "11 Medical", "11 CS"
ClassSection   (id, level_id, section_label, is_active) -- 1A, 1B, ... ; is_active handles the empty B/C rows
Subject        (id, name, tier)                         -- tier: CORE_EARLY | LIGHT_LATE | UNSET
Teacher        (id, name, campus_id, weekly_target=30, hiring_status) -- hiring_status: HIRED | TO_BE_HIRED
TeacherSubject (teacher_id, subject_id, class_section_id)  -- eligibility, from §6
PeriodSlot     (id, day, period_no, start_time, end_time, is_break)  -- now uniform across campus/level per §3, just Mon-Thu vs Friday variants
SubjectQuota   (class_section_id, subject_id, periods_per_week)
TimetableEntry (class_section_id, day, period_no, subject_id, teacher_id)
```

**New field vs v1:** `Teacher.hiring_status` — directly powers the "to be hired" warnings dashboard requested in §13. A `TO_BE_HIRED` teacher is a real row (so quota/eligibility can be planned against them) but should be visually and functionally flagged everywhere (dashboard warning, can't be assigned to a live TimetableEntry until hired, etc.) — this needs a product decision: should a TO_BE_HIRED teacher's periods show as "vacant" in the generated timetable, or should the timetable generation simply refuse to run to completion for any class that still depends on one? **Recommend the former (show as vacant, flag prominently)** so the rest of the schedule isn't blocked by known hiring gaps — confirm this choice with the client before building.

`TimetableEntry` remains the single source of truth — the "3 views" (per-teacher, per-class, per-period) are just different queries over this one table.

---

## 12. Scheduling Engine — Constraint List (unchanged design principle, updated details)

**Critical design principle:** the Excel's own FINE/ERROR system is reactive (fills first, checks after — like a CCTV camera catching a problem only after it happened). **Do not copy that approach.** Build proactive / correct-by-construction: every constraint enforced *while* generating, via a constraint solver (already prototyped feasible with Google OR-Tools CP-SAT), so an invalid schedule can never be produced. Take Excel's *rules* as requirements, not its *checking method* as the implementation pattern.

1. Every `(class_section, day, period)` gets exactly one `(subject, teacher)` — or an explicit "vacant, pending hire" marker for TO_BE_HIRED-dependent slots (see §11).
2. `SUM(periods assigned for class_section, subject) == SubjectQuota` for every class-subject pair.
3. No teacher double-booked across any `(day, period)`, across all classes/campuses.
4. `SUM(periods assigned to teacher across all subjects/classes) == 30` for every teacher (TO_BE_HIRED teachers included — their target still needs to "add up" on paper so the school can see the full shape of the vacancy).
5. `CORE_EARLY` subjects only in Periods 1–4; `LIGHT_LATE` only in Periods 5–7 (tier list pending client confirmation, §8).
6. Teacher eligibility restricted to `TeacherSubject` pairs (§6).
7. If a required quota is unfillable for lack of an eligible teacher, report exactly which class/subject/count is unfillable — never drop the requirement or guess a teacher.

**Not required for v1:** automatic absence/substitute-teacher logic.

---

## 13. Frontend (WebAdmin) Requirements

### What already exists (per current screenshots — Dashboard, Teachers, Classes, Timetable, Settings pages, React/Vite)
Good foundation — campus badges (JUNIOR/GIRLS/BOYS) already color-coded, teacher list with search/filter by campus/subject, class list with active/inactive toggle, a "Generate Conflict-Free Timetable" action with campus → class → teacher-view cascading selectors. **This structure should be kept and extended, not rebuilt.**

### Gaps to close

1. **Full CRUD everywhere it's a rule, not just Add:** the Teachers page currently has an "Add Teacher" button and a search/filter list, but the "Actions" column needs working Edit (and Delete) per row — clicking a teacher should open a full editable detail view (name, campus, every subject+class eligibility pair individually addable/removable, hiring status). Same for Classes (currently has an "Edit" button per row — confirm it opens a full class-subject-quota editor, not just an active/inactive toggle) and for Subject Quotas / Period Timings / Priority Tiers, which don't yet appear to have dedicated screens.
2. **Keep campuses strictly separate in the UI** — don't merge Junior/Girls/Boys into one shared table/view anywhere a user might confuse which campus a row belongs to (the current Classes page shows "10A" for both a Boys row and a Girls row side by side with only a small badge distinguishing them — easy to misread; consider prefixing or grouping by campus instead of relying on the badge alone).
3. **"To Be Hired" / data-completeness warnings dashboard (new page):** a dedicated page listing, in plain language: which teacher rows are `TO_BE_HIRED` placeholders and what subjects/classes depend on them; which class-subject requirements currently have zero eligible teacher; which class sections have 0 subjects seeded (the Classes screenshot already shows some rows with "Subjects Count: 0" — this page should explain *why* in one sentence each, e.g. "no quota data seeded yet" vs "section may not be active"). This is the single most useful page for the school contact to actually act on hiring decisions.
4. **Per-Teacher printable sheet** (already specified in v1): select a teacher → generate their weekly grid → export as PDF/print.
5. **Timetable generation page:** the cascading campus → class → teacher-view selector already exists in the UI — wire it to the actual CP-SAT-based generator (§12) once real data is seeded, and surface solver infeasibility messages directly in this page (not a silent failure).
6. **Reseed the database from real data** once the §2/§5/§6 conflicts are resolved with the school — the current 57-teacher/52-class placeholder data should not carry into the real launch.

### Rule of thumb (unchanged from v1)
> Rule/requirement (periods needed, who can teach what, when break happens, hiring status) → full CRUD.
> Result (generated schedule, printable sheet, warnings report) → generate/view/export only.

---

## 14. Open Questions — ✅ ALL RESOLVED (original list)

Every open question from earlier rounds has now been confirmed directly by the school:
- Section counts (§2) — confirmed.
- Geography/SS vs Pak Study (§5) — confirmed: Classes 1-7 use Geography/SS, Classes 8-10 use Pak Study.
- Miss TBH vs Miss TBH1 (§6) — confirmed as two separate vacancies.
- Subject priority tiers (§8) — confirmed, including the Period-4-Games rule for Group A classes.
- Boys Class 3 — confirmed as 1 section (3A).
- 11 Medical Games/subject periods — confirmed (Games=5/week; English/Urdu/Islamiat/Biology/Chemistry/Physics=5/week each, totaling 35).
- KG Friday "WRA" — confirmed as an IQ-building subject, not a revision/test period.

**Nothing from this original list is blocking anything.** However, see §15 for a newly-discovered gap found during implementation.

---

## 15. Newly discovered gap (found during Step 1 implementation) — needs one more school confirmation round

Claude Code correctly refused to invent data for three things we never actually got confirmed by the school:
1. **Boys subject-quota-per-class** (periods/week per subject, for each Boys class) — we only ever confirmed Boys *section counts* (§2) and Boys *teacher roster* (§6), never the subject-quota table itself.
2. **Junior subject-quota-per-class** (Pre-Nursery/Nursery/KG) — never asked.
3. **Junior teacher roster** — never asked; the school admin's typed document only covered Girls and Boys.

Until these are provided, the timetable generator will correctly and expectedly skip Junior and Boys classes ("no ClassSubject rows defined") — this is not a bug. **Girls campus is fully seeded and unblocked — Step 2 (priority tiers) and timetable generation can proceed for Girls right now.**

---

## 16. Pending Confirmations Tracker — ✅ ALL RESOLVED (2026-07-25)

Every item below has a final, confirmed answer from the school. Historical record kept for reference; see the cross-referenced sections for full detail.

| Question | Resolution |
|---|---|
| CORE_EARLY window vs quotas (8-10, 11 Medical) | ✅ Confirmed as strong preference, not hard wall (§8) — already implemented, now confirmed as final design |
| Boys subject-quota-per-class | ✅ Confirmed, full table in §5b |
| Junior subject-quota-per-class | ✅ Confirmed, full table in §5c |
| Junior teacher roster | ✅ Confirmed, full list in §6b |
| History tier | ✅ Confirmed LIGHT_LATE, optionally slot-shares with Geography/SS (§8) |
| Teacher capacity vs tier-window (Girls, 10/16 teachers) | ✅ Confirmed: strong preference is the correct final approach, not just an interim fix (§8) |
| No teacher listed for Games | ✅ Confirmed: rotating duty system, not a dedicated subject teacher — see §17 |

**Nothing remains open. All data-gathering for this project is complete as of 2026-07-25.**

---

## 18. Items From the Full 3-Campus Solve — ✅ ALL RESOLVED (2026-07-25, final round)

**Item 8 — Games duty capacity — ✅ RESOLVED.** Corrected model: 2 teachers per period supervise the whole ground regardless of how many classes share it (1 teacher if only 1 class); see §17. The originally-calculated 22-teachers-needed figure was based on a misunderstanding (2 teachers × number of classes) — actual demand is 1-2 teachers/period, always. No capacity ceiling exists under the real rule.

**Item 9 — Junior teacher weekly target — ✅ RESOLVED.** Confirmed 35/week, not 30 — Junior/homeroom teachers already include Games within their own section's teaching, unlike Girls/Boys where Games is separate duty. Update `Teacher.weeklyTarget` to 35 for all Junior-campus teachers.

**Nothing remains open. Every question raised across this entire project has a confirmed answer.**

---

## 17. Games — Rotating Duty System (✅ CONFIRMED, corrected model — 2026-07-25 final clarification)

**Corrected understanding — this replaces the earlier per-class assumption entirely.** The school clarified: duty is **2 teachers per PERIOD, supervising the entire ground/playground at once** — regardless of how many classes happen to have Games simultaneously in that period. If only 1 class has Games in a given period, 1 teacher suffices (less to supervise); if multiple classes share that period on the ground, it's still just 2 teachers total, not 2 per class. **This eliminates the capacity-shortage problem from the earlier (incorrect) "2 teachers × number of classes" calculation — actual demand is only 1-2 teachers per period, never more, no matter how many classes are on the ground at once.**

**What this means for the schema and solver:**
- `GamesDuty` should key on `(day, period)` → up to 2 teacher assignments, **not** `(day, period, classSection)` → 2 teachers each. All classes sharing a Games period share the same 1-2 duty teachers.
- Rule: if exactly 1 class has Games in that `(day, period)` slot, assign 1 available teacher; if 2+ classes share that slot, assign 2.
- Rotation fairness (no repeat pairing on consecutive days) still applies, just against a much smaller real demand than previously modeled.
- Games frequency reconfirmed unchanged: Classes 1-7 = 5/week, Class 8 = 3/week, Classes 9-10 = 1/week, "11 Medical" = 5/week.

**Games itself is not the bottleneck it appeared to be** — re-solve after this fix should show item 8's shortfall resolved or drastically reduced.

---


## 19. Solve Progress Timeline (historical — §21 is the final, authoritative state)

Kept for reference to show how the numbers evolved; **§21 below is the real final answer, not this section or §20.**

| Milestone | Total Assigned | Notes |
|---|---|---|
| After items 1-7 (soft tier windows, Boys/Junior seeded) | 1,056 / 1,155 (91.4%) | First full 3-campus solve |
| After items 8-9 (Games duty model corrected, Junior target=35) | 1,111 / 1,155 (96.2%) | Junior reaches 100% |
| After items 10-11 (same-day cap added) + first item-12 attempt | 1,136 / 1,155 (98.4%) | **Later found to be inflated** — Games' "any open period" fallback was leaking into CORE_EARLY periods, which is why this number looked better than it should have |
| After the CORE_EARLY-leak fix (properly bounding Games to LIGHT_LATE only) | 1,112 / 1,155 (96.3%) | Correctly-bounded number, item 12's final decision (§20) — **but see §21: a separate bug in this same number was found and fixed two days later** |
| After the item-13 fix (Games duty could push a teacher over target) | 1,107 / 1,155 (95.8%) | **This is the real, final number — see §21** |

---

## 20. Item 12 — Final Decision (2026-07-25) — superseded by §21, kept for history

Corrected verification showed the initial "43→18" improvement was mostly an accidental leak into CORE_EARLY periods (now fixed — confirmed 0 leaks across 63 Games entries). With the boundary properly enforced, Option 1 doesn't meaningfully close the gap: the LIGHT_LATE window was already near capacity. **Final decision: Option 3 — accept the 43-period Games shortfall as the permanent state.** Option 2 (hard-reserving Games periods against academic overflow) was rejected as too risky relative to its small benefit — it could reintroduce academic shortfalls in the near-100%-complete Junior/Girls/Boys academic schedule.

At the time, this section's numbers (Junior 280/280, Girls 467/490, Boys 365/385, Total 1112/1155) were believed final. **They weren't — see §21.**

---

## 21. Item 13 — Games Duty Over-Target Bug, Final Decision (2026-07-27)

**The bug:** morning testing found several teachers scheduled ABOVE their weekly target (e.g. Girls Teacher 11 32/30, Girls Teacher 7 32/30, Girls Teacher 10 31/30) — a real correctness bug, not a data-ceiling finding like items 8/10/12. A teacher's target has always been meant as a ceiling, never just a floor.

**Root cause:** `gamesDutyScheduler.ts` tracked duty load starting every teacher at 0, with zero awareness of their real academic load — so a teacher already exactly at target from academics alone looked no different from a teacher at 0 and could still be handed duty on top. Confirmed directly against real data before fixing (Girls Teacher 7: 30 academic + 2 duty = 32).

**Fix:** duty selection now seeds each teacher's running total from their real academic load and hard-excludes anyone already at or over target from duty consideration — never just deprioritizes them.

**Verified:** all 37 teachers checked directly after a full 3-campus regenerate — 0 over target (previously several).

**Accepted trade-off:** Games duty is measurably harder to staff once already-full teachers are correctly excluded — understaffed duty slots rose from ~2 to 20, and total assigned dropped from 1112/1155 to 1107/1155. Abdullah confirmed this explicitly: "correctly enforcing the ceiling matters more than the small extra gap," consistent with every other honest-shortfall decision in this project.

**Final, permanent numbers:** Junior 280/280 (100%), Total 1107/1155 (95.8%), every teacher within their target, every remaining gap (Games shortfall + 1 pre-existing Boys English gap) honestly reported via `classSubjectShortfalls`/`teacherShortfalls`/`gamesDutyGaps`. This is the project's true final solve state.
