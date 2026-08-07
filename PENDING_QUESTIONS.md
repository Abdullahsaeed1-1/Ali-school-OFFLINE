# Pending Questions — blocked on the school / a real decision

Tracks genuine rule/data conflicts found while building against
`APS_Timetable_Master_Spec.md` — things where the math or the confirmed
rules don't fit together, not implementation bugs. Nothing here should be
silently resolved by guessing; each entry gets updated in place once an
answer comes back, and work that isn't blocked by it continues in parallel.

Status values: `OPEN` (waiting on an answer) → `RESOLVED` (decision made,
noted here, implemented).

**Engineering phase closed out 2026-07-25, updated through 2026-07-28 —
items 1-13 and 15-17 are RESOLVED (17 is a finding with no fix needed
yet); item 14 is OPEN, sent to the school.**
The school answered everything, including a correction to the Games duty
model (§17/§18). Item 11 (same-day clustering, including in Games) is
fully fixed and verified. Item 12's first fix attempt (widen Games'
placement window) initially looked like a big win (43→18) but turned out
to be leaking into CORE_EARLY periods — caught and corrected same day; the
properly-bounded version recovers almost nothing, because Games'
LIGHT_LATE window was already being used to capacity. Final decision on
item 12: accept the Games shortfall as the permanent state (Option 3)
rather than risk the academic schedule for it (Option 2). Item 13
(2026-07-27) found and fixed a real bug: Games duty could push a teacher
over their weekly target since duty selection never checked real academic
load. **Since then: item 14 found Junior's Games has no hard-boundary rule
at all (44% land in periods 1-4, sent to the school for a decision); item
15 replaced greedy Games duty assignment with a true CP-SAT optimum; item
16 fixed a Lock+ceiling interaction that could silently reopen item 13's
bug.** Final state: 1107/1155 periods assigned (95.8%) across all 3
campuses, Junior at 100%, every teacher within target, every remaining gap
honestly reported. Item 10 remains a pure finding (a genuine roster
data-ceiling for the teachers who show a
shortfall, not fixable by the engine) — no action needed, kept here for
reference.

---

## 1. CORE_EARLY period window vs §5 quotas — Classes 8, 9, 10, 11 Medical

**Status:** ✅ RESOLVED (2026-07-25) — confirmed as a strong preference, not
a hard wall. Superseded by item 6's broader fix, same resolution.

**Result:** re-solving all 3 campuses with the soft-preference model, every
one of these 4 classes' CORE_EARLY subjects is now fully covered.

---

## 2. "History" has no confirmed tier in §8

**Status:** ✅ RESOLVED (2026-07-25) — school confirmed **LIGHT_LATE**,
same tier as Geography/SS. Optional slot-sharing with Geography/SS on
alternating days was suggested by the school as a nice-to-have, not
required — not implemented (History and Geography/SS are scheduled
independently within the LIGHT_LATE window, which the spec explicitly said
was an acceptable simplification).

**Implemented:** `Subject.tier` for History set to `LIGHT_LATE` in
`prisma/seed.ts`.

---

## 3. Boys campus subject-quota-per-class — not yet provided

**Status:** ✅ RESOLVED (2026-07-25) — full table confirmed in §5b
(extracted from `Boys Timetable 2023-24`, sheet 3), identical structure to
Girls. Seeded — all 11 Boys classes total exactly 35 periods/week each,
verified directly against the DB after seeding.

---

## 4. Junior campus subject-quota-per-class — not yet provided

**Status:** ✅ RESOLVED (2026-07-25) — full table confirmed in §5c
(extracted from `Junior Timetable 2026_27`). Seeded — all 8 Junior classes
total exactly 35 periods/week each, verified directly against the DB.
Required 3 new Subject rows not previously seeded: "English
Reading/Writing", "Urdu Reading/Writing", "Islamiat/GK" — these are
distinct, explicitly-labeled compound subjects in the confirmed table, not
the same as the generic "Reading/Writing" or "Islamiat" used by Girls/Boys.
Their tier is left `UNSET` (§8's tier table never covers Junior
specifically) — low-impact since Junior's soft-preference placement just
treats them as unrestricted.

---

## 5. Junior campus teacher roster — not yet provided

**Status:** ✅ RESOLVED (2026-07-25) — full roster confirmed in §6b: 7
hired + 1 TBH ("Miss TBH", Nursery C), one homeroom teacher per section,
whole-class model (not subject-specialist). Seeded, with `TeacherSubject`
eligibility **auto-generated** to cover every subject in that teacher's own
section's quota (§6b's explicit instruction), rather than typed out
subject-by-subject like Girls/Boys. Verified: each teacher's eligibility
row count matches their section's subject count exactly (6 for
Pre-Nursery, 9 for Nursery/KG).

**See item 9 below** — a real, quantified consequence of this model
surfaced once the full solve ran.

---

## 6. Tier-window (§8) is incompatible with the "one teacher, many classes" roster pattern — affects most of Girls campus

**Status:** ✅ RESOLVED (2026-07-25) — school confirmed the strong
preference approach (already implemented as the July 25 interim fix) is
the **permanent design**, not just a stopgap: "we know it's not possible
for each teacher to take early period... wherever possible, and especially
in lower classes, focus on major subjects like English/Science/Maths
earlier in the day." No further engine change needed or expected.

**Result:** confirmed via the full 3-campus solve — every Girls and Boys
class's non-Games academic requirements are now fully covered (0
shortfall). The only remaining shortfalls campus-wide are Games (item 8)
and one isolated Boys English gap (Class 3A, short 1/week — minor residual
capacity edge case, not investigated further given its size).

---

## 7. No teacher is assigned to teach "Games" at all

**Status:** ✅ RESOLVED (2026-07-25) — not a data gap, a different
mechanism entirely. School confirmed (§17): **existing teachers rotate
Games duty in pairs, 2/day**, so the same pair doesn't repeat on
consecutive days — no dedicated PE teacher, no fixed eligibility.

**Implemented:** `Backend/src/services/gamesDutyScheduler.ts` — a separate
pass run after the main CP-SAT solve (engineering choice, not school
input — §17 left this to us; reasoning documented in the module's
docstring). For each class's Games requirement, tries its preferred
period(s) first (Period 4 for Group A, periods 5-7 for Group B), finds 2
free HIRED teachers (TO_BE_HIRED excluded — not real people), preferring
whoever wasn't on that class's duty pair yesterday and whoever has done
the least duty so far. `TimetableEntry` gained a `secondTeacherId` column
to hold the pair. Junior is excluded from this entirely — homeroom
teachers are already eligible for Games in their own section like any
other subject (item 5), so Junior's Games stays in the normal CP-SAT solve.

**See item 8 below** — running this against real data surfaced a genuine
capacity limit, reported honestly rather than hidden.

---

## 8. Games duty has a real, quantified staffing-capacity ceiling

**Status:** ✅ RESOLVED (2026-07-25) — the school corrected the original
model (§17/§18): duty is **2 teachers per (day, period), supervising the
whole ground at once** — not 2 teachers per class. The "22 simultaneous
teachers needed" figure below was based on the earlier, incorrect
per-class assumption; it does not apply under the real rule.

**Implemented:** `gamesDutyScheduler.ts` reworked into two phases —
placement (per class, ignoring teachers) then duty assignment (grouped by
`(day, period)`, 1 teacher if exactly one class is on the ground that
period, 2 if two or more classes share it, never more regardless of group
size).

**Verified directly against the DB after the full 3-campus solve
(2026-07-25):** across all Girls+Boys shared Games slots, the max
teachers ever needed at one slot is **2** (14 slots needed 1, 17 needed 2).
Only 5 slots came up short-staffed (4 found 1/2, 1 found 0/1 — all
Monday/Friday period 6-7, where several classes' preferred window overlaps
with several teachers' academic lessons) — a small, real residual, not the
systemic ceiling originally reported. See item 12 for the larger remaining
Games gap, which turned out to be a placement problem, not a capacity one.

~~Original (superseded) finding, kept for history:~~ *Girls campus has 11
"Group A" classes (1-7, 11 Medical), essentially all wanting Games at
Period 4 most days. Each Games period needs 2 distinct free teachers. 11
classes × 2 = 22 simultaneous duty-teachers needed — but Girls only has 12
hired teachers total.* — this assumed each class needed its own pair,
which the school has now clarified is not how duty actually works.

---

## 9. Junior homeroom teachers' 30/week target vs their section's real 35/week load

**Status:** ✅ RESOLVED (2026-07-25) — school confirmed **35/week**, not
the general 30/week rule: their homeroom role already includes Games
within their own section's teaching, unlike Girls/Boys where Games is a
separate rotation duty on top of the 30.

**Implemented:** `prisma/seed.ts` — `seedTeachers` now takes a
`targetPeriodsPerWeek` parameter, defaulting to 30 (Girls/Boys), passed as
35 for the Junior call site.

**Verified directly against the DB after the full 3-campus solve
(2026-07-25):** all 8 Junior classes now show **0 shortfall** (280/280
periods assigned, every class exactly 35/35) — the mechanical 5/class gap
described below is fully gone.

~~Original (superseded) open question, kept for history:~~ *§7 confirms
every teacher's target is a fixed 30/week "regardless of how many
subjects/classes they cover," confirmed in the context of Girls/Boys
subject-specialists who each cover multiple classes. Junior is
structurally different — one teacher covers every subject for exactly one
section, and that section's own confirmed quota totals 35/week, not 30.*

---

## 10. Teacher-target shortfall is a genuine roster data-ceiling for 14 of 19 hired/TBH Girls+Boys teachers — NEW (2026-07-25)

**Status:** Finding only — no action needed, the constraint is already
soft and already reports the shortfall honestly. Raised by Abdullah after
inspecting Girls Teacher 4's actual printed sheet (27/30, not 30).

**The check:** for every teacher who shows a shortfall against their
30/week target, computed their "theoretical max" — the sum of
`ClassSubject.periodsPerWeek` across every real `TeacherSubject`
(subject, class) pair they're eligible for. This is the absolute most
they could ever be scheduled for, independent of the solver.

**Result:** every teacher who shows a shortfall has a theoretical max
strictly below 30 from their confirmed roster alone — there is no possible
assignment, by this solver or any other, that reaches 30 purely from
academic eligibility:

| Teacher | Hiring | Academic ceiling | Scheduled (incl. Games duty) |
|---|---|---|---|
| Girls Teacher 4 | Hired | 24 | 25-27 |
| Girls Teacher 1 | Hired | 26 | 26-28 |
| Girls Teacher 6 | Hired | 23 | 23-27 |
| Girls Teacher 12 | Hired | 22 | 24-25 |
| Boys Teacher 3 | Hired | 22 | 24-26 |
| Boys Teacher 7 | Hired | 21 | 23-25 |
| Boys Teacher 9 | Hired | 24 | 26 |
| Boys Teacher 11 | Hired | 21 | 22-24 |
| Miss TBH1/2/3, Sir TBH | To be hired | 10-29 | matches ceiling + duty |

(`scheduled` can exceed the academic ceiling because Games duty sessions
count toward a teacher's weekly total but don't require `TeacherSubject`
eligibility — this is exactly the 24 + 3 = 27 arithmetic Abdullah found by
hand for Girls Teacher 4. It's a range because how many duty sessions a teacher
draws varies slightly run to run — the shortfall list itself has ranged
from 12 to 14 teachers across recent re-solves as duty assignments shift;
e.g. Boys Teacher 4 and Boys Teacher 5, ceilings 26 and 28, crossed 30 with
enough duty sessions in the latest run and dropped off the list. The
ceiling itself never moves — only whether duty happens to close the
remaining gap for a given teacher in a given solve.)

**Conclusion:** this is not a solver bug and not something a smarter
constraint could fix — it's a direct, confirmed consequence of the
roster's own (subject, class) eligibility data. The teacher-target
constraint is already implemented as soft (shortfall slack in
`solve.py`), exactly as asked about — it already reports these shortfalls
by name and amount rather than failing or silently hiding them. No engine
change proposed; flagging in case the school wants to revisit individual
teachers' subject/class assignments to close specific gaps.

---

## 11. Same-subject-same-day clustering was pervasive — now fixed for academic subjects — NEW (2026-07-25)

**Status:** ✅ RESOLVED (2026-07-25) for academic subjects. Raised by
Abdullah after finding Geography/SS scheduled twice on Monday (periods 2
and 3) for class 5A, with zero Geography/SS the rest of that week.

**The finding (before the fix):** measured across the previous solve, 212
of 794 class-subject-day combinations (27%) had more than 1 period of the
same subject on the same day for the same class — the solver only ever
enforced the exact weekly total, never how it was distributed across the
week.

**Implemented:** `solve.py` constraint 8 — a hard cap of
`ceil(periodsPerWeek / 5)` periods of the same subject per class per day
(1/day for every currently-confirmed quota, since none exceed 5/week).
Always satisfiable in isolation (any N periods can be spread at ≤1/day
across 5 weekdays), so it can't make a previously-feasible quota
infeasible on its own.

**Verified directly against the DB after the full 3-campus solve
(2026-07-25):** 0 violations across all 1096 academic class-subject-day
combinations — the cap holds everywhere it applies to the CP-SAT solve.

**Residual exception (Games) — also fixed, 2026-07-25:** the 5 instances
of a class getting 2 Games periods on the same day were in
`gamesDutyScheduler.ts`'s own placement loop, which wasn't subject to
`solve.py`'s constraint 8 (Games is scheduled by a separate pass — see
item 7). Added the same `ceil(quota/5)`-per-day cap there. Verified after
the final re-solve: **0 same-day violations across all 1126
class-subject-day combinations, including Games** — fully closed, not just
academic subjects.

---

## 12. Games placement shortfall persists in Girls/Boys — a crowding-out problem, not a capacity one

**Status:** ✅ RESOLVED (2026-07-25) — went with Option 1 (widen Games'
placement window), per Abdullah's decision, then **corrected** after
Abdullah caught a boundary violation in the first implementation. See
correction note below — read that before trusting the "58% reduction"
figure from the first pass, which turned out to be an artifact of the bug.

**The conflict:** with item 8's capacity ceiling gone, a *different*,
smaller Games shortfall remains: 43 of the Girls+Boys campuses' 470
required weekly Games periods can't be placed (25 Girls, 18 Boys).
Investigating class "2A" (Girls) directly showed the root cause: its
weekly schedule fills **all 30** of its academic periods, but only across
**30 of its 35** available slots — the 5 periods left empty are *all* in
periods 1-3 (outside Games' LIGHT_LATE window), while periods 4/6/7/8 are
*completely* full of academic subjects on every single day. Games is
entirely excluded from the main CP-SAT solve for Girls/Boys (no fixed
eligibility — item 7), so the solver has no idea Games also needs periods
4-7 and freely uses them for academic overflow; item 11's same-day cap
makes this more likely by forcing academic subjects to spread across more
distinct periods (visible in the tier-window violation count: 148 Girls /
120 Boys).

**First implementation (2026-07-25, later corrected same day):** widened
`gamesDutyScheduler.ts` Phase 1 to fall back to "any other open period
that day" once the preferred window was full. This **incorrectly** reached
into CORE_EARLY periods (1-3 for Group A, 1-4 for Group B) — a direct
violation of the priority-subjects-first principle the tier system exists
for. It measured as a 43→18 shortfall reduction, but that reduction was
**driven almost entirely by the CORE_EARLY leak**, not by any legitimate
extra room in the LIGHT_LATE window. Abdullah caught this by inspecting
the fallback logic directly before it went further.

**Correction:** re-scoped the fallback strictly to Games' own LIGHT_LATE
window — Period 4 + periods 6/7/8 for Group A, periods 6/7/8 for Group B
(see `candidatePeriodsFor`). On inspection, `candidatePeriodsFor` already
returns *every* LIGHT_LATE slot available to a class's group — there is no
narrower "preferred slot" vs. wider "any LIGHT_LATE slot" distinction to
be made; the window is a single, indivisible set. So the "fallback" tier
in the corrected version is a no-op by construction: if that window is
full for a given class/day, there genuinely is no other LIGHT_LATE period
to try, and the placement is left as an honest shortfall — never widened
into CORE_EARLY. This matches the corrected instruction exactly.

**Verified directly against the DB after the corrected re-solve
(2026-07-25):**
- **0 Games entries in a CORE_EARLY period**, out of 63 Girls/Boys Games
  entries — the boundary now holds everywhere.
- Games shortfall: **43 periods** (25 Girls, 18 Boys) — one better than
  the 44 total from two rounds ago, the difference coming from item 11's
  same-day cap (still active, still verified at 0 violations across all
  1102 class-subject-day combinations, Games included) rather than any
  meaningful widening of Games' own window.
- Games duty capacity unaffected: max 2 teachers at any shared slot, only
  2 slots still understaffed.

**Conclusion:** Option 1, correctly bounded, does not meaningfully close
this gap — the LIGHT_LATE window was already being used to its fullest
extent before this round even started, so there was never a legitimate
"next best slot" left for it to recover.

**Final decision (2026-07-25):** Option 3 — accept the 43-period Games
shortfall (25 Girls, 18 Boys) as the **permanent state**. Option 2's risk
to the academic schedule (potentially reintroducing shortfalls that were
just eliminated) isn't worth it for closing a Games-only gap this size.
This closed out the engineering phase for the timetable generator at that
point: verified state was 1112/1155 periods assigned (96.3%). **See item
13 — that number moved again the next day once a real correctness bug in
Games duty staffing was found and fixed.**

---

## 13. Games duty could push a teacher over their weekly target — real bug, fixed

**Status:** ✅ RESOLVED (2026-07-27).

**The finding:** morning testing after item 7 (manual class lock) surfaced
several teachers scheduled ABOVE their weekly target, not just below it —
e.g. Girls Teacher 11 32/30, Girls Teacher 7 32/30, Girls Teacher 10 31/30. This breaks a
rule that's been true everywhere else in this system since the start: a
teacher's target is a **ceiling**, never just a floor to reach toward.

**Root cause, confirmed by reading the code, not guessed:**
`gamesDutyScheduler.ts`'s duty-selection logic (Phase 2) tracked a
`dutyCount` map seeded at 0 for every teacher, incremented only as duty got
handed out *within that one scheduling run*. It had zero awareness of a
teacher's real academic load or their target — so a teacher already
sitting at exactly 30/30 from academic assignments alone looked no
different from a teacher at 0, and could still be freely selected for
duty and pushed over. Confirmed directly against real data before the fix:
Girls Teacher 7 had exactly 30 academic rows (at target) plus 2 more Games duty
periods stacked on top, landing at 32.

**Fix:** the running total used for duty selection is now seeded from each
teacher's real academic load (read from the freshly-written solve results
for that campus, since Games duty runs immediately after and nothing else
has touched the table yet), not from 0. Any teacher whose running total is
already at or over their target is now **excluded** from duty
consideration entirely for that slot — not deprioritized, excluded — same
principle as every other hard rule in this system (§12 point 1/3/6).

**Verified directly (2026-07-27):** ran a full 3-campus regenerate and
checked all 37 teachers directly against their real scheduled totals —
**0 are over target**, down from several before the fix.

**Accepted trade-off:** this makes Games duty measurably harder to staff,
since a teacher already at target is no longer available to plug a gap.
Games duty gaps rose from ~2 to 20 understaffed slots, and total assigned
periods moved from 1112/1155 to **1107/1155 (95.8%)**. This isn't a new
problem — it's the real staffing picture once the ceiling is actually
enforced, and Abdullah confirmed this trade-off explicitly: "correctly
enforcing the ceiling matters more than the small extra gap," consistent
with every other honest-shortfall decision in this project (items 8, 10,
12). This was the final, permanent state as of 2026-07-27 — see items
14-16 below for what changed the next day.

---

## 14. Junior's Games has no hard-boundary rule at all — RESOLVED with the school's answer (2026-07-27)

**Status:** ✅ RESOLVED — school confirmed the exact periods; implemented
as a genuine hard constraint and verified with zero violations.

**The school's answer:** Pre Nursery gets Games at **both** lecture 3 and
lecture 7, every day (10/week = 2/day × 5 days — matches the original
Excel ground truth and the confirmed Games-frequency table). Nursery gets
lecture 4, every day (5/week). KG gets lecture 5, every day (5/week).
Junior gets the same hard-boundary treatment as Girls/Boys Group A —
these periods are reserved for Games and forbidden to every other
subject, not just preferred.

**Why this needed real solver work, not a copy-paste of item 12's
fix:** Girls/Boys Group A's hard boundary is enforced by
`gamesDutyScheduler.ts` restricting candidate periods for a *separate*
duty-rotation pass — Games there has no fixed teacher, so it's scheduled
after the main academic solve. Junior's Games has always gone through the
*main* academic solve (`solve.py`) instead, taught by the same homeroom
teacher as everything else in that section's day (§17's Guidelines page
note). So "the same hard-boundary treatment" had to be built as an actual
new hard constraint inside `solve.py` itself — a mechanism that didn't
exist there before (point 5 in `solve.py`'s own docstring was, until now,
soft everywhere).

**Built (`solve.py` point 9, new):** `Backend/src/utils/school.ts` gained
`juniorGamesHardSlots()`, mapping grade → required lecture indices (Pre
Nursery → [3,7], Nursery → [4], KG → [5], any other/future Junior grade →
`null`, deliberately not guessed). This is threaded through
`timetableGenerator.ts` → `schemas.py` → `solve.py` as a new
`gamesHardSlots` field per class. Enforced with the same mechanism as
teacher eligibility (the only other truly hard rule in this solver): for
a class with hard slots, Games variables are created **only** at those
lecture indices, and every other subject's variables are **not created at
all** at those same indices — a real two-sided wall via variable
non-existence, not a penalty weight, so there's no way for the constraint
to be "mostly" respected. Also corrected the soft tier-violation reporting
so Games periods placed in their mandatory hard slot are never counted as
a "violation" (they were, briefly, against the old Girls/Boys-style {5,6,7}
default, before this fix accounted for the real per-grade window).

**Feasibility checked before touching the solver, not after:** every
Junior class's total weekly quota is exactly 35 periods against exactly 35
available weekly slots (zero slack school-wide, not just around Games) —
confirmed via the real Pre Nursery A / Nursery A / KG A quota data.
Carving out specific hard positions for Games doesn't remove any capacity
that was previously usable; it only fixes *which* position Games occupies
instead of leaving it free — so this could not mathematically introduce a
new shortfall, and the live regenerate confirmed that (see below).

**Verified live, fresh regenerate, direct DB check:** all 280/280 Junior
periods assigned, zero class-subject shortfalls, zero teacher shortfalls,
solver status `OPTIMAL`. Checked all 50 Games entries directly against
the DB (accounting for the break-adjusted lecture-index offset in
Junior's period structure): **0 landed outside their grade's required
slot, and 0 other subjects ever occupy a reserved slot** — down from the
22/50 (44%) mis-placed before this fix. Every Pre Nursery class shows
exactly 2 Games periods/day (lecture 3 and 7), every Nursery/KG class
shows exactly 1/day, across all 5 weekdays for every section. All 8
Junior teachers confirmed still exactly at their 35/35 target after the
regenerate. (A secondary, expected side effect: the general soft
tier-violation count for Junior's *other* subjects — still-unconfirmed
LIGHT_LATE preferences, item 6, unrelated and still open — shifted
slightly since two lecture slots are now permanently claimed by Games in
an already-zero-slack week; this doesn't affect any hard guarantee and was
not the thing being fixed here.)

**Original finding, for reference:** `gamesGroupForClass()` only assigns
Group A/B by parsing `gradeLevel` as a number 1-10 — Junior's gradeLevel
values never matched, so every Junior class got `gamesGroup: null` and
fell through to a generic soft LIGHT_LATE bucket with none of Girls/Boys
Group A's hard-boundary protection. Quantified at the time: 22 of 50
Games periods (44%) landed outside periods 1-4, Girls/Boys unaffected
(0/38, 0/22). See the resolution above for what changed and how it was
verified.

---

## 15. Games duty assignment was greedy, not optimal — fixed with a real optimizer (2026-07-27)

**Status:** ✅ RESOLVED.

**The question:** Abdullah asked whether the Games duty shortfall (item 13's
accepted trade-off) could be reduced by smarter slot-processing order,
rather than accepted as a necessary cost of the ceiling fix.

**Confirmed, not guessed:** extracted the exact Phase 2 problem (same
groups, same teacher capacities, same busy-slots) from a live snapshot and
fed it to a true optimal CP-SAT solver for comparison. The old greedy,
chronological first-fit left **8 of 44 needed Girls duty-slots uncovered
even though a feasible assignment covering all of them existed** for the
exact same constraints. Boys was already at its ceiling.

**Fix:** replaced the greedy pass in `gamesDutyScheduler.ts` Phase 2 with a
call to a new `/solve-duty` endpoint on the solver service
(`duty_solve.py`) — a small CP-SAT model that maximizes coverage first,
then spreads duty evenly as a secondary preference, still enforcing the
same hard per-teacher capacity constraint (item 13's ceiling fix is
untouched — this can only change *which* slots get covered, never let
anyone over target).

**Verified across 4 fresh regenerates:** actual coverage now exactly
matches the theoretical optimum every time (re-confirmed via the same
extract-and-compare method after each run — 0 gap, always). The raw
shortfall number still varies run to run (1106-1111 assigned observed) —
that's the *academic* solve's own non-determinism changing how much spare
teacher capacity is left over for duty each time, not a flaw in this fix;
duty assignment now reliably captures 100% of whatever room exists.

---

## 16. Lock + ceiling-fix interaction — a locked class's committed periods weren't discounted upstream (2026-07-27)

**Status:** ✅ RESOLVED.

**The bug:** found while verifying item 15 — a teacher (Girls Teacher 2) showed
31/30 with a Games duty entry sitting on a *locked* class (item 7). Traced
it precisely: locking a class freezes its rows, but nothing told the
*academic* solver that a teacher already had periods committed there
(academic or Games duty) — it kept offering them a full fresh target for
the rest of the campus, so the moment they touched a locked class, their
true total could exceed the ceiling item 13 was supposed to guarantee.

**Fix:** before building the solver request, `timetableGenerator.ts` now
computes each teacher's real commitment *from locked classes only*
(`computeScheduledPeriodsByTeacher`, scoped to locked class IDs) and
subtracts it from the target fed to the solver for that run, clamped at 0.
Reporting/UI still show the teacher's true, full target — only the
solver's internal input changed.

**Verified two ways:** (1) locked a real Girls class with committed Games
duty, regenerated — 0 over target. (2) Locked 3 classes at once
deliberately (14 affected teachers, commitments up to 15 periods) and
regenerated — every teacher landed within target. This matters
practically since Lock is an actively-used feature going forward — without
this fix, using Lock could have quietly reopened item 13's exact bug.

---

## 17. Schedule stability across regenerates — real practical consequence, school should know (2026-07-27)

**Status:** finding only, no fix applied yet — but flagged as something
worth the school knowing explicitly, not discovering by surprise.

**The question:** Abdullah asked whether a teacher's own specific
assignments (which exact day/period they teach which class) stay stable
between regenerates, or reshuffle unpredictably — a real comfort concern,
since a locked-in real-world schedule shouldn't feel random to the people
living it.

**Confirmed precisely:** ran two fresh regenerates on identical input data
and diffed every cell directly.
- **Always stable:** every class-subject's weekly total period count
  (246/246 identical) — "5A gets exactly 5 Maths periods this week" never
  changes. Junior's teacher assignment is also structurally stable (one
  homeroom teacher per section, guaranteed by the data model).
- **Not stable:** which exact (day, period) a subject lands on (only ~21%
  of Junior's cells were byte-identical between the two runs), and —
  bigger — **which specific teacher teaches a given class-subject pair for
  Girls/Boys** (66-71% of Girls/Boys cells changed both subject and
  teacher between the two runs, even though the pair was fully covered
  both times).

**Concrete practical consequence (the reason this needs to be said plainly,
not just noted internally):** a teacher's printed weekly sheet (or the
Teacher Timetable page) generated one week can show **different day/period
placements** — and for Girls/Boys, potentially a **different set of
classes entirely** — the next time anyone clicks Generate, even if nothing
about the school's actual requirements, rosters, or targets changed at all
in between. A teacher who printed and pinned up their Monday-Friday
schedule could find it doesn't match reality anymore after an unrelated
regenerate (e.g. one done to fix a single other class). This is a real
operational risk if Generate is run more than once per term without
everyone knowing the schedule can shift underneath them.

**Why:** `solve.py` runs CP-SAT with 8 parallel search workers and no
random seed or "prefer the previous solution" term. Many different
underlying assignments hit the exact same optimal objective score, and
nothing tells the solver to favor the one closest to last time.

**Not fixed** — this wasn't today's ask, and a fix (e.g. seeding the solver
with the previous solution as a warm start, or adding a small "stay close
to last time" term to the objective) is a real design decision of its own.
Flagging here so it isn't lost, and so the school can be told plainly:
**treat each Generate as potentially reshuffling everyone's day/period
placements (and, for Girls/Boys, who teaches what), not just filling
gaps** — print schedules only after the *final* regenerate for a term, not
before.

---

## 18. Manual single-slot override — built (2026-07-28)

**Status:** ✅ RESOLVED — the feature deferred earlier (originally item 4)
is now built, exactly to the design agreed then.

**The need:** an admin who likes almost all of a generated schedule and
just wants to fix one (class, day, period) shouldn't have to risk a full
regenerate reshuffling everything else — especially now that item 17
confirms regenerates really can reshuffle unrelated placements.

**Built:** click any cell in a class's Timetable grid to edit exactly that
one period — pick a subject (from that class's real curriculum) and a
teacher (any teacher in the campus), or clear the period entirely. Two
validation strengths, exactly as agreed:
1. **Hard block, never overridable:** the chosen teacher is already
   teaching (or on Games duty) elsewhere at that exact (day, period) — a
   physical impossibility. No confirm path exists for this one.
2. **Soft warning, confirm to proceed:** the chosen teacher has no
   `TeacherSubject` eligibility row for this subject/class. Real use case:
   a short-notice substitute often genuinely isn't the normal eligible
   teacher — that's the point of the feature, not a mistake to block.

**Verified live, all three paths:** hard block correctly rejected an
already-busy teacher with the exact conflicting class named; soft warning
correctly required an explicit "Confirm & Save Anyway" click before
applying; clear + re-save correctly emptied and then restored a period.
Confirmed via direct DB query that the restored state exactly matches the
original (same teacher, same subject) — nothing else was touched by any of
the test edits.

## 19. Concurrent teacher edits could silently overwrite each other — real bug, fixed (2026-07-27)

**Status:** ✅ RESOLVED — reproduced directly, then fixed with optimistic
concurrency, then re-verified live.

**The investigation:** asked to check what happens if two admins edit the
same teacher at the same time, or if a teacher is edited while a Generate
is running for that teacher's campus.

**Confirmed bug — silent data loss:** two admins opening the same
teacher's Edit drawer at the same time, each making a *different* change
(e.g. Admin A adds a subject/class eligibility pair, Admin B changes the
phone number) and both clicking Save, resulted in the second save
completely overwriting the first with **no error, no warning** — Admin
A's change vanished with nothing to indicate it had ever been saved. Root
cause: `updateTeacher` read-modified-wrote the whole record (including a
full delete-then-recreate of eligibility rows) with no check that the
record hadn't changed since the drawer was opened — classic
check-then-write race, not fixable by "trying again," since neither admin
would ever see a reason to.

**Confirmed safe — mid-Generate edits are not lost, just delayed:**
editing a teacher's eligibility while a Generate is running for their
campus does **not** get overwritten or lost (Generate never writes to
`TeacherSubject`). However, the in-flight Generate's output is built from
a snapshot taken *before* the solver ran, so it does not reflect an edit
made mid-run — the edit takes effect on the *next* Generate, not the one
already in progress. Not a bug, but worth knowing: an admin who edits a
teacher while watching a Generate spinner shouldn't expect that edit to
show up in the results that are about to appear.

**Fix — optimistic concurrency via `updatedAt`:** the Edit Teacher drawer
now sends back the teacher's `updatedAt` timestamp as it was when the
drawer was opened (`expectedUpdatedAt`). The backend does an atomic
compare-and-swap (`updateMany` with `id` + `updatedAt` in the `where`
clause, inside the same transaction as the eligibility rewrite) — if
`updatedAt` no longer matches (someone else saved in between), the whole
transaction rolls back and the request is rejected with `409
STALE_TEACHER`, never partially applied. The drawer shows a clear banner —
*"This teacher was changed by someone else since you opened this record.
Reload to see the latest before saving your changes."* — with a "Reload"
button that re-fetches the current record and discards the admin's
unsaved edits, exactly as agreed. This protects every teacher record, not
just ones an admin remembers to lock (see item 20 below for the separate,
narrower Teacher Lock feature).

**Verified live, end to end:** reproduced the exact original race via a
direct API call standing in for "the other admin," confirmed the second
save now gets `409 STALE_TEACHER` instead of silently succeeding, and
confirmed the DB kept the first admin's change untouched. Then repeated it
through the real browser UI — a second save (via API, simulating another
admin) landed while the Edit drawer was still open in Playwright's
browser; saving from that stale drawer showed the conflict banner
immediately, and clicking "Reload" correctly pulled in the other admin's
saved value and discarded the open drawer's unsaved edit.

**Not yet tested — flagged, not urgent:** two admins clicking *Generate*
for the same campus at the same time. This wasn't part of what was
reported and hasn't been reproduced, but the generator likely has the same
"last transaction wins" shape (it deletes and recreates a campus's
`TimetableEntry` rows without any equivalent version check). Worth
revisiting before this system has multiple admins actively using it
day-to-day, but not urgent while it's effectively single-admin-at-a-time
in practice today.

## 20. Teacher Lock — built (2026-07-27)

**Status:** ✅ RESOLVED — new feature, independent of Class Lock (item 7).

**The need:** once a teacher's profile (details + subject/class
eligibility) is set up and correct, an admin should be able to freeze it so
it can't be accidentally changed by anyone — including mid-way through an
unrelated bulk edit of other teachers, or via a Capacity Advisor
suggestion applied to the wrong row.

**Scope decision (asked explicitly):** locking freezes the *entire*
record — name, email, phone, campus, status, target/max periods, and
subject/class eligibility — not just eligibility. It has **no effect** on
that teacher's existing timetable placements or on future regenerates;
that's what Class Lock is for. The two locks are intentionally
independent: locking a teacher doesn't lock any class, and locking a class
doesn't lock any teacher.

**Built:**
- `Teacher.isLocked` column (migration `add_teacher_is_locked`), toggled via
  a dedicated `PATCH /teachers/:id/lock` endpoint (separate from the
  general `updateTeacher`, so toggling the lock itself is never blocked by
  the lock it's about to set).
- `updateTeacher` and `deleteTeacher` both reject with `423 TEACHER_LOCKED`
  and a clear message if the teacher is currently locked.
- Guarded the two places that mutate `TeacherSubject` *outside*
  `updateTeacher` too — `applySafeFill` and `applyReassignment` (Capacity
  Advisor, item 5/11) now check `isLocked` on every teacher they'd touch
  (both sides of a reassignment), otherwise Teacher Lock could be silently
  bypassed through that widget.
- WebAdmin: a lock/unlock control with a confirmation modal sits at the top
  of the Edit Teacher drawer; while locked, every field, the add/remove
  eligibility controls, the Capacity Advisor widget, Delete, and Update are
  all disabled, and a small "Locked" badge shows next to the teacher's name
  in the main Teachers list (list-row Delete is disabled too).

**Verified live:** locked a teacher through the UI (confirm modal → all
fields correctly disabled, Delete/Update disabled, list badge appeared,
row-level Delete disabled); confirmed via direct API calls that both
`PATCH` and `DELETE` are rejected with `423 TEACHER_LOCKED` while locked;
unlocked through the UI and confirmed all fields re-enabled; confirmed via
a final DB read that the teacher's data was completely unchanged by the
test (lock/unlock touches only `isLocked` and `updatedAt`).

## 21. Inline Capacity Advisor fix suggestions on red/amber flags — built (2026-07-27)

**Status:** ✅ RESOLVED — extends item 3's inline problem-flag pattern so a
flagged gap can be resolved on the spot, not just explained.

**The need:** the Timetable page's shortfall flags and Teacher Timetable
page's blank periods already said *what* was wrong; they didn't say
whether it was fixable or offer a way to fix it without a separate trip to
the Capacity Advisor page.

**Built, two places, same underlying idea:**
- **Timetable page** — a class's shortfall flag (the red dashed cell) now
  shows, per unfilled subject, which of the campus's under-occupied
  teachers could take it (SAFE FILL / REASSIGNMENT, same rules as the main
  advisor), with an Add/Review button right in the popover. Backed by a
  new endpoint, `GET /capacity-advisor/gap?classId=&subjectId=` — the
  mirror image of the main advisor: instead of "what could this teacher
  fill," it answers "who could fill this exact gap." Lazy-fetched only
  when the flag is actually clicked open.
- **Teacher Timetable page** — hovering any of a teacher's own blank
  periods shows the same kind of suggestion (via the existing
  teacher-scoped advisor), since a teacher's blank period *is* their
  under-occupancy made visible. Uses a CSS-only hover reveal (not
  click/JS-state) specifically so the shared reassignment-confirm modal it
  can open is never at risk of being unmounted by the mouse moving off the
  cell mid-interaction — a real failure mode with a naive JS-hover
  implementation that was caught and designed around before shipping, not
  discovered after.

**Refactored for reuse rather than duplicated:** extracted the
single-teacher fill-suggestion state/logic into a `useTeacherFillSuggestions`
hook (shared by the Edit Teacher drawer's existing widget and the new
Teacher Timetable hover hint) and a shared `ReassignmentConfirmModal`
(shared by all three surfaces — Edit Teacher, Timetable page, Teacher
Timetable page) — one apply/error/toast implementation, not three.

**Real bug caught and fixed during verification (not by guessing, by
testing):** the new Add/Review buttons live inside the Timetable page's
shortfall flag, which itself sits inside a clickable grid cell (item 18's
manual slot editor). Clicking "Review" was also bubbling up and opening
the manual Edit Slot modal underneath, at the same time as the reassignment
confirm modal — two modals stacked. Fixed by stopping click propagation at
the `ProblemFlag` popover container itself (protects any future children
rendered inside it, not just this one case), and re-verified clean (exactly
one Cancel button, correct modal, no double-open) both on the Timetable
page and the Teacher Timetable page.

**Verified live:** cross-checked the new gap-fix endpoint's output against
the main Capacity Advisor's own data for the same pair (Boys Teacher 7 ↔
Boys Teacher 3, Urdu, several Boys classes) — identical numbers from both
endpoints. Confirmed in the browser: Timetable page's 4A/Science shortfall
showed a real Review button, opened the correct reassign-confirm modal
with the right gain/lose numbers, Cancel closed it cleanly. Teacher
Timetable page's Boys Teacher 7 (9 short of target) showed the same
suggestion on hover over his blank periods, Review opened the identical
modal shape. Confirmed via a fresh API read afterward that no eligibility
data was actually changed by any of this testing (only Cancel was ever
clicked, by design).

## 22. Classes had no create endpoint at all — real CRUD gap, fixed and tested end-to-end (2026-07-27)

**Status:** ✅ RESOLVED — a genuine gap against the original full-CRUD
requirement for Classes, not just a missing test path.

**What was found:** there was no `POST /classes` anywhere in the API, and
no "Add Class" control anywhere in WebAdmin. Every class in this system
had been created exclusively by hand-editing `Backend/prisma/seed.ts` and
reseeding — there was no admin-facing way to add one at all, and therefore
nothing was validating a new class the way `createTeacher` already
validates a new teacher.

**Built:** `POST /api/classes` (name, campusId, section required;
gradeLevel and stream optional/free-text) plus an "Add Class" button and
form in the Classes page, mirroring the Edit Teacher drawer's pattern. A
brand-new class starts with zero subject quotas and zero teacher
eligibility, exactly like today's classes did right after being seeded —
quotas are added via the existing subject-quota editor, eligibility via
the Teachers page, no special first-time treatment needed for either.
Class deletion remains soft-only (the existing `isActive` toggle, no hard
`DELETE`) — intentionally left as-is since it mirrors Teacher's own
soft-delete convention (set inactive rather than destroyed) rather than
being a newly-discovered gap.

**Also fixed while testing this:** `listClasses`'s ordering
(`classes.controller.ts`) sorted by `gradeLevel` directly in the database
— since `gradeLevel` is a free-text string, not a number, this was a
lexicographic sort ("10" sorting before "2"), and mixing in Junior's
"Nursery"/"KG" strings would have made the list order worse, not better.
Fixed with the same numeric-aware-then-alphabetical comparator already
used client-side in `ClassesPage`'s grade grouping, applied server-side
too.

**Numeric-grade-parsing audit (the specific question asked):** traced
every place in the codebase that touches `gradeLevel` expecting a number.
Found exactly one real site — `Backend/src/utils/school.ts`'s
`gamesGroupForClass()`, already the fully-diagnosed root cause of item
14's Junior Games gap (a non-numeric grade parses to `NaN`, so the
function returns `null`, and Junior classes get no protected Games
window). Two call sites (`timetableGenerator.ts`, `gamesDutyScheduler.ts`)
just inherit that `null` — neither has its own separate bug. `solve.py`
never touches grade strings directly. No other numeric-grade assumption
exists anywhere else in the backend.

**Verified live, full workflow, with a deliberately non-numeric grade:**
added "Prep A" (gradeLevel `"Prep"`) to Junior campus through the new UI;
set its Maths (5/wk) and English (5/wk) quotas through the existing
quota editor; assigned Junior Teacher 7 (a real Junior teacher, already at
her 35/35 target from her existing class KG C) eligibility for Prep A's
Maths through the Teachers page — the existing "this teacher is already
fully occupied" warning fired correctly, exactly as it would for any
existing class, no special case needed. Ran Generate for Junior campus:

- **Confirmed no crash, no special-casing needed** — the non-numeric
  grade "Prep" behaved exactly like Junior's existing "Nursery"/"KG"
  grades (same already-known item 14 gap, nothing worse or different).
- **Confirmed the target ceiling held correctly for a brand-new class
  competing for an already-maxed teacher:** the solver scheduled Prep A's
  Maths using Junior Teacher 7, but kept her total at exactly 35/35 the whole
  time — it did this by reallocating some of her existing KG C periods
  rather than exceeding her cap. **Real, worth-knowing consequence for
  admins:** adding a new class's requirements to a teacher who is already
  at target doesn't create free capacity — it can reduce what that
  teacher covers in their *other* classes to make room, since the solver
  will never exceed target/max. A new class needs either a teacher with
  genuine spare capacity, or an explicit understanding that something
  else will give way.
- **Confirmed Capacity Advisor picks up a brand-new class's unfilled
  requirement automatically, with zero special handling:** Prep A's
  English (5/wk, no eligible teacher at all) showed up as an ordinary gap
  after Generate; `GET /capacity-advisor/gap` for that exact (class,
  subject) pair correctly returned zero candidates (every Junior teacher
  is at their target, so none qualify) — the same "no automatic fix,
  needs a staffing decision" outcome an existing class's gap would get,
  not a crash or an empty/broken response.

**Cleanup:** removed Junior Teacher 7's test eligibility pair, cleared Prep
A's quotas, set Prep A inactive, then regenerated Junior campus again —
confirmed via a fresh DB read that KG C is back to fully filled (Diary
5/5, Games 5/5, Urdu 4/4, etc.) and Junior Teacher 7 is back to exactly
35/35 on KG C alone, matching her state before this test began.

## 23. Subjects had the same CRUD gap as Classes — fixed, tier now a visible UI field (2026-07-27)

**Status:** ✅ RESOLVED.

**What was found:** the exact same gap as item 22, but for Subjects.
There was no `POST`/`PATCH` for Subjects at all — only `GET /subjects` —
and `listSubjects` didn't even select the `tier` column, so the frontend's
`Subject` type had no field for it. Subjects (including `tier`) were only
ever set by hand-editing `Backend/prisma/seed.ts` and reseeding. This is
exactly how both previous tier bugs happened (item 2's "History" sitting
with an unconfirmed tier, and the Junior-specific subjects tier gap) —
there was no other way to set it.

**Built:** `POST /api/subjects` and `PATCH /api/subjects/:id` (name, code,
isCore, tier), plus a new dedicated **Subjects** page in WebAdmin (own nav
entry) with Add/Edit — deliberately its own page rather than a dropdown
tucked inside another page's editor, specifically so tier stays visible
and hard to miss, matching the reasoning that it's already caused two real
bugs from being invisible. A brand-new subject defaults to `tier: UNSET`
(matching the Prisma schema default) — never guessed — and the create
success toast explicitly calls out an unconfirmed tier so it isn't
missed. The page also shows a page-level banner counting how many
subjects currently have no confirmed tier, plus a `ProblemFlag` on each
one explaining why (reusing the same inline-explanation pattern from item
3), so an unconfirmed subject is something an admin would actually notice
rather than something they'd have to know to look for.

**Real, pre-existing gap surfaced by this (not caused by it):** building
this page revealed that **"Arabic" currently has an unconfirmed tier** in
the live data — a third subject in the same situation as History and the
Junior subjects, just never caught before because there was no page that
would ever show it. This is now visible on the Subjects page's own banner
and per-row flag; worth the school confirming Arabic's tier the same way
History's was resolved (item 2).

**Verified live:** created a test subject through the new UI with no tier
set — confirmed the "unconfirmed tier" toast and page banner both fired
correctly and the row showed the amber "Unconfirmed" badge with a working
explanation flag. Edited it to set `CORE_EARLY` — confirmed the badge
changed to "Core — early periods" and the banner's unconfirmed count
dropped by one. Cleaned up the test subject afterward (Subject has no
delete endpoint and no `isActive` field to soft-disable, unlike Class/
Teacher, so this was a one-off direct database removal, not something
exposed to the admin UI) and confirmed via a fresh API read that the
subject list is back to its real set, with Arabic still correctly showing
as the one genuine unconfirmed case.

## 24. Reallocation-risk preview before assigning an already-maxed teacher — built (2026-07-28)

**Status:** ✅ RESOLVED — direct follow-up to item 22's finding.

**The need:** item 22 showed that assigning an already-at-target teacher to
a new class doesn't create capacity — the next regenerate can take periods
away from their *existing* classes to make room instead. That should never
happen silently; the admin needs to see it coming, the same way Class
Lock's impact preview shows real numbers before locking rather than after.

**Built:** `GET /teachers/:id/reallocation-risk` — computes the teacher's
real current per-class breakdown (distinct day+period slots, same counting
rule as everywhere else so Games-duty sharing can't inflate a class's
share). In the Edit Teacher drawer, adding an eligibility pair to a teacher
already at/over target now opens a confirmation modal first, showing
exactly which of their current classes (and how many periods each) are
at risk, before the pair is added to the draft at all. A teacher with
spare capacity still gets the pair added immediately, no extra friction.

**Deliberately scoped to what's actually knowable:** this shows the
teacher's real *current* breakdown, not a prediction of which specific
periods a future regenerate will pick to sacrifice — that depends on the
solver's own optimization across the whole campus and isn't something a
lookup can know in advance without literally running a hypothetical solve.
The modal is worded accordingly ("at risk of losing periods," not "will
lose exactly these periods") so it doesn't overclaim precision it doesn't
have, while still giving the admin real, concrete numbers rather than a
generic warning.

**Verified live:** opened Junior Teacher 7 (35/35 target, teaching only KG C)
in the Edit Teacher drawer, added a new pair (English / Nursery A) —
confirmed the modal appeared with the correct current-class breakdown
("KG C — 35 periods"), confirmed "Add anyway" correctly appended the pair
to the draft. Closed the drawer without saving and confirmed via a fresh
API read that Junior Teacher 7's real eligibility was untouched (still only
KG C) — no residue left from the test.

## 25. Granular Lock — day-level and single-period-level — built (2026-07-28)

**Status:** ✅ RESOLVED — extends the existing whole-class Lock (§13) to two
finer levels, same underlying mechanism for both.

**A real gap found while designing this:** checked whether item 18's manual
single-slot override actually survives a regenerate — it doesn't.
`timetableGenerator.ts`'s delete step wiped every row of every non-Locked
class unconditionally, so a manual fix was only ever good until the next
Generate for that campus, and this wasn't documented anywhere. This is
exactly what the period-level lock now fixes.

**Built — one new field, two UI entry points:** `TimetableEntry.isLocked`
(mirrors `Class.isLocked`/`Teacher.isLocked`). A locked row survives
regeneration untouched; everything else in its class stays open.
- **Single-period lock**: toggle on the Timetable page's existing
  click-to-edit cell (item 18) — `PATCH /timetable/slot/lock`. Grid cells
  show a small lock icon when locked; the edit modal disables
  Subject/Teacher/Clear while locked, with an Unlock button.
- **Teacher-day lock**: a bulk convenience in the Edit Teacher drawer — one
  button per weekday, `PATCH /teachers/:id/lock-day` sets `isLocked` on
  every one of that teacher's real periods that day (across whichever
  classes they're in), independent of Teacher Lock (§20), which only
  protects the profile. Locking opens a confirm modal listing the real
  classes affected (same principle as Class Lock's impact preview);
  unlocking is immediate, matching that same asymmetry.

**Solver work — the real complexity, all in `solve.py` point 10 (new):**
for any locked row, no variable is created for that exact class+slot
(nothing can compete with what's already there), and no variable is
created for that slot's teacher(s) at ANY other class's same slot either
(prevents double-booking someone whose time is already committed). Both
enforced purely through variable non-existence — the same mechanism as
eligibility and item 14's Junior Games hard slots, not a penalty weight, so
there's no way for the rule to be "mostly" respected.
`timetableGenerator.ts` also: reduces each locked class-subject's
remaining weekly requirement by however many periods are already
locked-filled (so the solver doesn't try to independently fill the full
original quota on top of what's frozen), and discounts a locked teacher's
target for that run via a new `computeCommittedPeriodsByTeacher` (extends
item 16's whole-class-lock discount to row-level locks too, one shared
computation for both).

**Also fixed while building this:** `gamesDutyScheduler.ts` (Girls/Boys
Games duty — a separate pass from the main solve) didn't know about
locked Games periods at all — its quota math would have tried to schedule
the *full* original Games quota on top of an already-locked period,
over-scheduling that class's Games count. Fixed the same way (quota and
same-day-cap seeding both now account for locked Games rows). Junior's
Games goes through the main solve, already covered by the point 10 fix
above.

**Two real bugs caught and fixed during verification, not by guessing:**
1. The admin-facing generation stats (`byClass`, `totalEntries`) only
   tallied what a run newly *wrote* — a class with any locked period was
   reported short of its true total (28/35 shown for a class actually at
   35/35) even though the real schedule was completely correct. Fixed by
   counting locked rows into both tallies too.
2. The teacher-day lock's confirm-modal preview and per-day button state
   were reading fields (`className`, `isLocked`) that don't exist on
   `getTeacherTimetable`'s response shape (a differently-shaped, older
   endpoint than `getTimetable`) — the preview silently showed no classes
   and the "fully locked" detection never worked, though the actual lock
   action underneath was unaffected (it doesn't depend on that display
   data). Fixed by switching to the correctly-shaped endpoint
   (`getTimetable` with a `teacherId` filter), the same one
   `TeacherTimetablePage.tsx` already uses. `getTeacherTimetable` itself is
   now confirmed dead code in the frontend — left alone, not in scope here.

**Verified live, both features, direct DB checks at every step:**
- Locked one real period (Science / Boys Teacher 10 / Monday, Boys 4A),
  regenerated the whole campus: that exact row survived untouched while
  every other period on Monday for that class changed; confirmed Sir
  Salman wasn't double-booked anywhere else at that slot; confirmed
  Science's weekly total came out at exactly 5/5 (1 locked + 4 newly
  solved), no over- or under-count.
- Locked all 7 of Junior Teacher 7's real Monday periods (Junior KG C),
  regenerated Junior campus twice in a row: Monday's exact 7 entries
  survived unchanged both times, every other day regenerated freely, her
  total stayed exactly 35/35 (never exceeded even combining locked +
  freshly-solved periods).
- UI-verified both lock/unlock paths end to end in the real browser
  (single-period modal and the teacher-day confirm modal + immediate
  unlock), including catching and fixing the two bugs above through that
  same live testing.
- Cleaned up every test lock afterward and confirmed via fresh API reads
  that zero locked rows remain in either campus.

## 26. Capacity Advisor's "Beyond Software" now gives human guidance, not just a dead end — built (2026-07-28)

**Status:** ✅ RESOLVED.

**The need:** a BEYOND SOFTWARE teacher previously got one flat sentence —
no existing subject matches a real gap — and nothing else. Useful as an
honest "no" (never guessing a bad suggestion), but no help at all for the
admin's next move.

**Built, two purely informational panels, no action button on either —
adding a brand-new subject to a teacher's profile is a staffing decision,
never something this page executes on its own:**
- **"Worth a look"** — campus-wide gaps that have genuinely no eligible
  teacher at all, filtered to ones sharing an existing *tier*
  classification (CORE_EARLY/LIGHT_LATE — a real, already-confirmed
  attribute, not a guessed pedagogical fit) with a subject this teacher
  already teaches.
- **"Most urgent uncovered gaps on this campus overall"** — the campus's
  largest such gaps regardless of this teacher, for broader context.

Both draw from one new campus-wide computation (`uncoveredGapsByCampus` in
`capacityAdvisor.controller.ts`) — every (class, subject) requirement with
zero eligible teacher anywhere, excluding Games (it has no fixed
eligibility by design, §7/§17 — not a real staffing gap). Shared between
the full Capacity Advisor page and the compact Edit Teacher widget via one
new `BeyondSoftwareGuidancePanel` component.

**Confirmed the real dataset has almost no non-Games uncovered gaps right
now** (checked directly: 25 uncovered gaps system-wide, all Games, zero
everywhere else) — most current shortfalls come from REASSIGNMENT
situations or TBH placeholders (which already hold real eligibility rows),
not genuinely zero-eligibility gaps. This means the two guidance panels
will often be empty today, which is correct, not a bug — there's nothing
to point to when nothing is actually uncovered.

**Verified live with a controlled test (temporary, fully reverted):**
removed Boys Teacher 5's sole eligibility for Reading/Writing in Boys 4A
(same LIGHT_LATE tier as Boys Teacher 11's Computer Science, an existing
beyond-software teacher) to create one genuine uncovered gap. Confirmed
both panels picked it up correctly — "Reading/Writing (4A, 3/wk)" in both
lists — with a live browser screenshot showing the exact rendered
guidance, clearly framed as a staffing conversation rather than an
executable suggestion. Restored Boys Teacher 5's original 18-pair eligibility
list immediately after and confirmed via a fresh API read that it matches
exactly, byte for byte.

## 27. Pre-finalization audit — 4 items re-verified with fresh evidence (2026-07-28)

**Status:** 3 confirmed working as designed; 1 real gap found and left
OPEN (needs a school answer, not a guessed fix — same pattern as item 14).

**1. Concurrency fix (optimistic locking, item 19) — ✅ CONFIRMED, re-tested
fresh.** Reproduced the exact race again: two "admins" load the same
teacher snapshot, Admin A saves first (200, succeeds), Admin B saves
second using the now-stale `updatedAt` — rejected with `409
STALE_TEACHER`, DB retains Admin A's change untouched. Repeated the same
race through the actual browser UI (API save while the Edit Teacher drawer
was open) — the conflict banner rendered correctly with the "Reload"
action. Both runs cleaned up, no residue.

**2. Two concurrent Generates for the same campus (flagged in item 19,
previously untested) — tested directly, mixed but bounded result, no
silent data corruption.** Fired two `POST /timetable/generate` requests
for Boys campus at the exact same time, twice:
- **Run 1:** one request got `200 OK`, the other got `409
  DUPLICATE_ENTRY` — a visible error to whoever triggered the second one.
- **Run 2:** both requests returned `200 OK`, but only one solve actually
  persisted — the "losing" request's own reported stats no longer matched
  anything in the database, with no error telling its caller that
  happened.
- **In neither run did real corruption occur** — no duplicate
  `(class, day, period)` rows, and zero genuine teacher double-bookings
  (my first pass at this flagged 44 "double-bookings," which turned out to
  be a bug in my own check — it didn't account for Games duty
  legitimately sharing one teacher across several classes at once, §17's
  by-design behavior; corrected and re-ran to confirm zero real
  conflicts). Postgres row-level locking appears to serialize the two
  transactions' delete+insert steps rather than truly interleaving them.
- **Practical takeaway:** it will not corrupt the schedule, but it is NOT
  safe to treat as a no-op — the "losing" admin can see a false success
  message for a solve that was silently discarded. Recommend: don't rely
  on this being safe in practice once multiple admins are actively using
  Generate around the same time; a proper fix would need a lock/mutex per
  campus, not attempted here since it wasn't asked for. Restored Boys
  campus to a clean, verified-consistent state after every run.

**3. A genuinely new class with a non-numeric, non-Junior grade (e.g. "11
Arts") — ❌ REAL GAP CONFIRMED, left OPEN.** Traced the code first:
`gamesGroupForClass()` only recognizes numeric grades 1-10 and the literal
name `"11 Medical"` — its own comment already names `"11 CS"` as an
example that falls through to `null`. `juniorGamesHardSlots()` only
recognizes Pre Nursery/Nursery/KG. For a class matching neither, **both
return null**, and `gamesDutyScheduler.ts`'s `candidatePeriodsFor()` falls
back to `return daySlots` — literally every period of the day as a
candidate, not even a soft preference (its own comment already says
"Junior/unclassified: shouldn't normally reach here"). Verified this
empirically, not just by reading code: created a real test class ("11
Arts", grade "11", Boys campus, Games quota 5/week, no other subjects),
regenerated the campus, and found **all 5 of its Games periods placed at
Period 1** — squarely in the protected CORE_EARLY window, with zero
restriction at all. This is the same category of bug item 14 fixed for
Junior, now confirmed to also apply to any future class the current rules
don't recognize. Cleaned up (cleared quota, deactivated the test class,
regenerated) and confirmed Boys campus is back to its normal state.
**Left open deliberately** — same reasoning as item 14: guessing a hard
placement rule for a grade the school hasn't specified is exactly the
mistake item 14 was built to avoid. Needs a real answer (which grade
labels are coming, what Games rule applies to each) before it's coded.

**4. Full subject/tier inventory — confirmed Arabic is the only unset
case.** Pulled every subject directly: **21 total, 20 with a confirmed
tier, exactly 1 (`Arabic`, Elective) still `UNSET`.** Full breakdown:
CORE_EARLY — English, Maths, Science, Biology, Chemistry, Physics.
LIGHT_LATE — Activity, Diary, English Reading/Writing, Games,
Geography/SS, Islamiat, Islamiat/GK, Pak Study, Reading/Writing, Urdu,
Urdu Reading/Writing, WRA, Computer Science, History. Confirms the scope
is exactly as item 23 already stated — no other unconfirmed subjects
exist beyond Arabic.

## 28. Gaps & Suggestions page — built (2026-07-28)

**Status:** ✅ RESOLVED — new page, deliberately built as a browsing
surface over existing logic, not a new suggestion engine.

**The need:** class-level and teacher-level gaps were scattered across
Warnings, Capacity Advisor, and the Timetable page's inline popups, with
no single place to browse "everything wrong with this one class" or
"everything wrong with this one teacher."

**Built — zero new backend endpoints, confirmed reuse throughout:**
- **Class view** (Campus → Class): extracted `computeClassSubjectShortfalls`
  out of `TimetablePage.tsx` into a shared pure function (both pages now
  call the same computation, not two copies), then reuses
  `ClassGapFixSuggestions` (item 5/21's inline fix-suggestion component)
  unchanged in its actual logic.
- **Teacher view** (Campus → Teacher): reuses the exact `TeacherFillSuggestions`
  component already used in the Edit Teacher drawer — same component,
  same hook, same Add/Review buttons, same `beyondSoftwareGuidance` panel
  (item 26). Confirmed via a live screenshot that the beyond-software
  message text is byte-identical to what the Edit Teacher drawer already
  shows for the same teacher.

**Two real, pre-existing issues found and fixed while wiring this up —
not by guessing, by actually looking at what the reused component would
show:**
1. `ClassGapFixSuggestions` was silently dropping any shortfall subject
   with zero fix candidates from its list entirely (rather than saying so)
   — meaning a genuinely "beyond software" class-subject gap never told
   the admin that plainly, on the Timetable page's popup either, before
   this fix. Now shows a clear "beyond software — hire someone or have an
   existing teacher take this on" message per subject instead of silently
   omitting it.
2. Fixing #1 immediately surfaced a second, real problem: Games shortfalls
   would now show that same "hire or reassign" message, which is actively
   wrong for Games — it has no fixed eligibility on Girls/Boys by design
   (§7/§17, a duty-rotation model, 2 teachers per slot for the whole
   ground, not per-class capacity), already correctly explained on the
   Warnings page. Fixed by excluding Games from this gap-analysis path
   entirely and substituting a message that points to the real
   explanation instead of a misleading generic one. Both fixes benefit the
   pre-existing Timetable page popup too, not just the new page.

**Also reorganized the existing Warnings page for consistency** (explicit
ask, confirmed the exact grouping approach with Abdullah first): kept the
same 4 category sections (Hiring gaps / Zero eligible teacher / Games duty
/ Empty classes), but each section's rows are now grouped Campus → Class
instead of one flat list, using the same Junior/Girls/Boys display-order
convention already used on Classes/Teachers/Capacity Advisor. Hiring gaps
(teacher-centric, not single-class-scoped) group by Campus only, matching
their natural grain.

**Verified live:** confirmed the Warnings page renders all 4 sections
correctly grouped by campus (screenshot showed Junior/Girls/Boys badges
with per-campus item counts). Confirmed Gaps & Suggestions' Class view on
Boys 4A shows "Games 3/5 scheduled" with the correct duty-rotation
explanation (not the misleading hire-someone message). Confirmed Teacher
view on Boys Teacher 11 (23/30, beyond software) shows the identical message
already verified for the same teacher in item 26's Capacity Advisor test.

## 29. Gaps & Suggestions' Teacher view promised a UI action that didn't exist — found live, fixed (2026-07-28)

**Status:** ✅ RESOLVED.

**The bug (found live by Abdullah, Boys Campus, Boys Teacher 4, Teacher
view):** `TeacherFillSuggestions.tsx`'s beyond-software message hardcoded
"Closing this needs a new subject added manually below" — true in its
original home (the Edit Teacher drawer, where the eligibility editor
really does sit directly below) but false when the same component is
reused on the new Gaps & Suggestions page (item 28), where nothing is
below it. The message promised an action that wasn't there.

**Checked the Class view too, as asked — not affected.** Its beyond-software
message (`ClassGapFixSuggestions.tsx`) is self-contained — "the school
needs to either hire someone for this subject or have an existing teacher
take it on" — it never pointed at a specific piece of UI, so there was
nothing to break.

**Fix:** added an optional `beyondSoftwareManualAddHref` prop to
`TeacherFillSuggestions`. Default (Edit Teacher drawer) keeps the original
"below" wording unchanged. Gaps & Suggestions now passes
`/dashboard/teachers?teacherId=X`, rendering a real link ("Edit this
teacher's subjects →") instead. `TeachersPage.tsx` reads that query param
once on mount and auto-opens the matching teacher's Edit drawer, then
clears the param.

**A second, real bug surfaced while verifying the link actually worked —
not just that it rendered:** the first version cleared the query param
with React Router's `setSearchParams({}, { replace: true })`. Live testing
(Playwright, with mount/unmount tracing added temporarily) showed this
call — not the async data fetch — was what caused `TeachersPage` to fully
remount partway through opening, wiping the `drawerOpen` state `openEdit`
had just set. The drawer's own data fetch worked fine every time; only the
visible "drawer open" result was being lost. Root cause traced to
`AppLayout.tsx`'s `AnimatePresence`-wrapped `<Outlet/>`, which reacts badly
to a search-param-only navigation. Fixed by clearing the param with the
raw `window.history.replaceState(null, '', window.location.pathname)`
instead of going through React Router's navigation state at all — same
end result (param gone from the URL), no remount.

**Verified live (Playwright, Boys Teacher 4, Boys Campus):** message text
confirmed correct, link click confirmed to navigate to
`/dashboard/teachers`, Edit Teacher drawer confirmed open with Sir
Mursaleen's correct details loaded (screenshot), URL confirmed cleared
back to `/dashboard/teachers` with no leftover `teacherId` param. `tsc
--noEmit` clean.

## 30. Explicit, required "Games protection" field on Class — replaces grade-name inference entirely (2026-07-28)

**Status:** ✅ RESOLVED — permanently closes the entire bug category item
27 found (the "11 Arts" case), not just the specific grades already known.

**The problem this replaces:** Games' protected periods used to be inferred
from `gradeLevel` at runtime by two functions in `utils/school.ts` —
`gamesGroupForClass` (Girls/Boys Group A/B) and `juniorGamesHardSlots`
(Junior's confirmed §14 answer). Both returned `null`/no-match for any
grade name they didn't recognize, and `gamesDutyScheduler.ts`'s
`candidatePeriodsFor` then fell back to `daySlots` — the **entire day,
including CORE_EARLY periods 1-3** — for any such unclassified class. A
genuinely new grade (e.g. "11 Arts") would silently get zero Games
protection with no error, no warning, nothing — confirmed live in item 27.

**Fix — one explicit field replaces both inference functions:**
- `Class.gamesProtectedLectures: Int[]` (`@default([])`) — which of
  lecture periods 1-7 Games is reserved in for this class, if any. Empty
  array is a real, meaningful answer ("confirmed: no protection needed"),
  not a placeholder.
- `Class.gamesProtectionConfirmed: Boolean` (`@default(false)`) — must be
  explicitly `true`. Enforced server-side in `classes.controller.ts`'s
  `createClass`/`updateClass`, not just nudged in the UI: a class can
  no longer be created (or have this field changed) without a real,
  affirmative answer. This is what makes the fix structural rather than a
  patch — there is no code path left that infers this from a name.
- `gamesGroupForClass`/`juniorGamesHardSlots` deleted from `school.ts`.
  `timetableGenerator.ts` and `gamesDutyScheduler.ts` now read
  `cls.gamesProtectedLectures` straight from the DB. The solver
  (`solve.py`/`schemas.py`) takes the same field directly; the hard-wall
  enforcement (Junior, Games flows through the main solve) is gated on
  whether Games is actually a requirement for that class — Girls/Boys
  never send Games as a requirement (handled by the separate duty
  scheduler instead), so their `gamesProtectedLectures` only narrows the
  CORE_EARLY soft window for other subjects, exactly as the old
  Group A/B narrowing did — confirmed no behavior change for existing
  classes (see verification below).
- `gamesDutyScheduler.ts`'s `candidatePeriodsFor` no longer has an
  unrestricted fallback: it's always `{5,6,7} ∪ gamesProtectedLectures` —
  never the whole day. This is the actual line that fixes the bug
  category — there is no more "I don't recognize this grade" path at all.
- Add/Edit Class UI (`ClassesPage.tsx`): a required "Games protection"
  section (period 1-7 toggle buttons + an explicit "I've confirmed Games
  protection for this class" checkbox) on the Add Class form — Save stays
  disabled until checked. Existing classes get the same toggle buttons in
  their edit drawer, saved via a new "Save Games protection" action
  (`updateClass`, independent of the existing "Save subject quotas"
  button).
- Existing classes backfilled with their real, already-confirmed
  historical values (Group A/§8 → `[4]`, Group B/§8 → `[]`, Junior's §14
  answers → `[3,7]`/`[4]`/`[5]`) via a one-time script against the live
  dev DB — not a reseed, which would have wiped manually-entered data.
  `seed.ts` updated the same way for any future fresh reseed.

**Verified live, structurally (Playwright + direct DB checks, Boys
Campus):** created a brand-new class named "11 Commerce" (grade "11",
section "Commerce") — deliberately the same kind of grade name the
software has never seen before, same shape as item 27's "11 Arts" case —
through the actual new Add Class UI. Confirmed Save stayed disabled until
the confirmation checkbox was checked. Protected period 4, added a Games
quota of 5/week, ran a real Generate for Boys Campus. Result: all 5 Games
periods landed at lecture 4 every single day, zero in periods 1-3, with
real duty teachers assigned by the duty solver — with **no gradeLevel
pattern anywhere in the path**, proving the fix is structural, not another
special case. Regression-checked two pre-existing classes after the same
Generate: 6A (old Group A, protected=`[4]`) still lands Games at lecture 4
exactly as before; 9A (old Group B, protected=`[]`) shows an honest,
pre-existing Games shortfall on the Warnings page (required 1, scheduled
0) — the same already-documented crowding-out behavior from item 12, not a
new regression. Test class and its timetable entries hard-deleted after
verification; Boys Campus regenerated once more to a clean 11-class state.
`tsc --noEmit` clean on both Backend and web-admin.

**Found during backfill, not created by this change:** two pre-existing
inactive classes with zero subjects/eligibility/timetable data — "Prep A"
(Junior) and "11 Arts" (Boys) — left over from earlier sessions' live
testing (item 22/27) and never fully cleaned up. Both are harmless
(inactive, correctly excluded from generation, and the Warnings page
already lists them under "no subjects seeded" with a note that inactive
sections aren't expected to have quotas) but are dangling test rows
Abdullah may want removed — there's no hard-delete-class endpoint, so this
would need a direct DB action; flagged rather than silently deleted.

## 31. Two concurrent Generates for the same campus — the "loser" no longer gets a false success (2026-07-28)

**Status:** ✅ RESOLVED — same optimistic-concurrency principle as item 19
(teacher-edit conflicts), applied to campus-wide Generate.

**The problem:** flagged early on as an untested risk, then actually tested
in item 27's audit: two admins (or two tabs) hitting "Generate" for the
same campus at nearly the same time didn't corrupt data (each write is its
own atomic transaction), but the "losing" request — the one whose
academic-solve transaction committed first, only to have a
near-simultaneous second request's transaction commit right after and
overwrite it — got back a normal 200 response with real-looking stats,
even though what it just computed was never what ended up persisted. A
real trust issue: the caller has no way to tell their Generate actually
"won."

**Fix:** `Campus.timetableGenerationVersion` (`Int @default(0)`) — an
optimistic-concurrency counter, same pattern as `Teacher.updatedAt` /
`expectedUpdatedAt` (item 19). `timetableGenerator.ts` captures each
campus's version at the very start of that campus's processing (before its
slow CP-SAT solver call — the real-world race window), then does a
compare-and-swap inside the SAME transaction as the main academic
delete+insert: `campus.updateMany({ where: { id, timetableGenerationVersion:
expectedVersion }, data: { increment: 1 } })`. If that matches zero rows,
another Generate for this campus already committed first — a new
`StaleGenerationError` is thrown, rolling back this transaction entirely
(nothing partially written), and this specific campus is recorded in a new
`conflicts` array instead of being counted toward the response's totals.

**The Games-duty phase needed its own check, not just the main solve's:**
duty scheduling runs as a SEPARATE transaction after the main solve commits
(it needs to read the freshly-written academic entries, and it makes its
own external call to the duty-solver service) — a second window where a
THIRD Generate could commit in between. Guarded by checking (not
re-bumping) that the version still equals `expectedVersion + 1` right
before `scheduleGamesDuty` runs; if it's moved again, this campus's whole
result — academic assignments included — is now stale (superseded by a
newer Generate) and gets reported as conflicted too, not just the duty
part.

**Per-campus isolation, not all-or-nothing:** a multi-campus Generate call
(`campusId` omitted) processes each campus independently — one campus
losing this race is caught and recorded per-campus, then the loop
`continue`s to the next campus, so the other requested campuses still
succeed normally in the same call. Any OTHER kind of error (a real bug, the
solver service being down, etc.) still propagates and aborts the whole
call exactly as before — only `StaleGenerationError` gets this specific
isolation, since it's an expected, recoverable condition, not a failure.

**Frontend:** `GenerateTimetableResponse` gained a `conflicts:
{campusId, campusName}[]` field, always present (empty on a clean run).
`TimetablePage.tsx`'s `generate()` checks it before treating anything as
success — since this page always targets one campus, a non-empty
`conflicts` for that campus now shows a clear error toast ("this request's
result was not saved — please try again") instead of the misleading
success/gaps toast, and still reloads the grid afterward so the screen
reflects whichever request actually won.

**Verified live (direct concurrent HTTP calls, Girls Campus, mirroring the
item 27 audit's original test but now checking the fix):** fired two
Generate requests for Girls Campus at the same time. Result: one came back
with `conflicts: []` and real stats (490 total, 14 classes); the other
came back with `conflicts: [{Girls Campus}]` and `totalEntries: 0` — an
honest signal, not a false success. Confirmed the DB itself ended up fully
self-consistent: `timetableGenerationVersion` was exactly 1 (proving only
one of the two writes actually took effect, not two, not a partial mix),
465 real TimetableEntry rows, zero duplicate (class, day, period) triples.
Regression-checked a normal all-campuses Generate (no concurrency) — 200,
zero conflicts, all 33 active classes across all 3 campuses covered,
matching pre-change behavior. `tsc --noEmit` clean on both Backend and
web-admin. Test artifacts removed; all 3 campuses left in a clean,
singly-generated state by the final regression check.

## 32. Tier-violation concentration — a roster-scarcity floor, not a D.1 regression (2026-07-29)

**Status:** ✅ RESOLVED — investigated as a P0 report ("priority-tier
placement broken after the Games-protection refactor"), root-caused to a
pre-existing roster reality, and a fairness redistribution fix shipped.

**The report:** live screenshots after item 30's refactor showed Boys 3A
with Islamiat (LIGHT_LATE) in Period 1 on 4/5 days and CORE_EARLY subjects
scattered into periods 5-7 — looked like the CORE_EARLY/LIGHT_LATE
mechanism (§8, item 6) had broken campus-wide.

**Investigated, not assumed:** read `_preferred_lecture_indices` and the
point-9 hard-wall — confirmed the hard wall only ever engages for classes
with a real Games *requirement* (Junior only); for Girls/Boys it only
narrows the soft CORE_EARLY window exactly as it always did. Ran live
regenerates against the real solver (Boys ×3, Girls ×1): **tierWindowViolations
landed at exactly 120 (Boys) / 148 (Girls) every single time** — the
identical totals item 12 documented as the baseline back on 2026-07-25,
before item 30 existed. If D.1 had changed the optimization, this number
would have moved; it didn't, repeatedly. Conclusion: no regression in the
general mechanism.

**What screenshots actually caught — a real, different problem:** broke the
120/148 total down per class (never done before) and found it wildly
uneven and *consistent across repeated regenerates* — Boys 3A/4A/6A at
60-70%, Girls 2A at 87%, while other classes sat under 20%. The objective
minimized the campus-wide total with zero fairness term, so it was free to
dump the (fixed) total onto whichever classes were solver-cheapest.

**Root cause, quantified per teacher (not guessed):** for every CORE_EARLY
and LIGHT_LATE teacher on both campuses, computed real weekly demand
(periods taught in that subject, summed across every class they cover)
against their theoretical max (one person, ~15-20 preferred-window slots/
week, no matter how many classes want them there). Nearly every specialist
teacher is overcommitted — e.g. Boys Teacher 10 teaches Science to 6 Boys
classes (30/wk demand) but can fit at most 15/wk into the early window;
Girls 2A's three core teachers (Adeena/Mehak/Laila) are each in the exact
same 30-demand/15-max position, which is exactly why 2A was hit hardest.
Summed excess demand across all overcommitted teachers: **116 (Boys) vs.
120 measured, 143 (Girls) vs. 148 measured** — the roster math alone
explains almost the entire total. **This is the same "specialist teacher
covering too many classes" reality the school described at the very start
of the project** (§8's own explanatory note already anticipated occasional
non-Period-1 placement) — now directly quantified: roughly half of these
teachers' periods are mathematically guaranteed to miss their preferred
window, regardless of solver quality. Confirmed with Abdullah this is a
staffing-conversation finding, not something an algorithm can fix — the
total (120/148) is a fixed floor.

**Fix implemented — redistribute the fixed total, don't chase a lower one:**
`solve.py` gained a secondary objective term, `TIER_FAIRNESS_WEIGHT = 10`
(between `TIER_VIOLATION_WEIGHT=100` and `TEACHER_SHORTFALL_WEIGHT=1`, so
it only ever breaks ties among solutions that already share the
true-minimum total, never sacrifices total compliance for evenness):
`max_class_tier_violations` (a new `AddMaxEquality` over each class's own
violation-var sum) is minimized alongside the existing terms, pushing the
solver toward spreading the unavoidable overflow evenly across classes
instead of concentrating it.

**Verified live, before/after, same regenerate method:** Boys' per-class
range went from 9-70% to a tight **30-37%** across all 11 classes; Girls'
went from 6-87% to **21-43%** across all 14. Both totals stayed exactly at
120/148 — confirming the fix redistributes, never reduces (the floor is
real). Solver status stayed `OPTIMAL` both times.

**One real trade-off found, not hidden:** Girls' solve time rose to 28.4s
against the 30s `max_time_in_seconds` cap (was ~7-11s before) — the
fairness term makes the search harder. Still `OPTIMAL` today, but a bigger
future roster could push this over the cap and fall back to merely
`FEASIBLE` (non-optimal) results. Not addressed here since it isn't a
problem yet — flagged for whoever next touches solve performance.

**Recommend relaying to the school:** the underlying cause (most subject
specialists covering 5-8 classes) isn't fixable in software — only hiring
more subject-specialist coverage per subject would raise the 120/148 floor
itself. Worth a staffing conversation, separate from anything this system
can solve.

## 33. Phase 2 punch list — 3 items confirmed already working, 1 real feature built (2026-07-29)

**Status:** ✅ RESOLVED.

**1. Teacher Timetable hover — action button "missing."** Not reproducible.
Live-tested (Playwright, real browser, Boys Teacher 7/Boys, 7 short of
target, non-beyond-software): hovering a blank period shows the same
Review buttons Capacity Advisor uses, fully clickable (screenshot
confirmed). The only case that legitimately shows text with no button is a
genuine BEYOND SOFTWARE teacher — item 26's explicit, intentional design
(no software action exists for that case). No code change made.

**2. Warnings page Campus→Class grouping — consistency self-check.**
Screenshotted the full page live. All 4 sections use the same campus
badge + item-count heading; hiring gaps group by campus only (correct —
teacher-centric, not class-scoped, per item 28's original reasoning), the
other three group by campus then class/row. Structurally and visually
consistent. No change made.

**3. Girls showing no suggestions at all.** Not reproducible on either
Capacity Advisor or Gaps & Suggestions — live-checked both (Class view on
2A, Teacher view on Girls Teacher 4) with real data (7 Girls teachers currently
under target) and both rendered correctly with working buttons. Best
explanation: a transient "fully staffed at that moment" state (a *correct*
all-clear, not a bug) caught right after a regenerate — Girls' capacity
picture shifts between regenerates same as item 17 already documents for
placements generally. No code path found that's Girls-specific or broken.

**4. Simplified single-slot editing for Junior — built.** Junior's
homeroom model (§6b: one teacher per section, eligible for everything in
it) made the general single-slot editor (item 18) higher-friction than
necessary there: its Teacher dropdown lists *every* teacher on the whole
campus, unfiltered by class — for Junior this meant an admin could
accidentally assign a different section's teacher to this one (the
backend would only soft-warn, never block, since that teacher genuinely
teaches that subject somewhere). Fixed in `TimetablePage.tsx`: for a
Junior-campus class, derives `juniorHomeroomTeacherId` from the class's
own already-scheduled entries (not name-matching against the teacher
list) — when every entry agrees on one teacher, the modal replaces the
full dropdown with a read-only display ("Junior Teacher 7 — this section's
homeroom teacher — only one is possible") and the edit-slot handler
pre-fills that teacher automatically, even for a currently-blank slot. Any
ambiguity (no entries yet, or more than one teacher somehow) falls back to
the normal full picker rather than guessing. Non-Junior classes are
completely unaffected — same dropdown as before. No backend change: this
reuses the exact same `saveSlot`/`putSlot` path item 18 already verified
end-to-end, just pre-filling one field.

**Verified live (Playwright):** Junior KG C's edit modal shows the
simplified read-only teacher field with the correct name (Junior Teacher 7)
and only a Subject dropdown to fill; Boys 3A's edit modal (regression
check) still shows the full multi-teacher dropdown, unchanged. `tsc
--noEmit` clean on web-admin.

## 34. Phase 3 punch list — 4 items built (2026-07-29)

**Status:** ✅ RESOLVED.

**5. Lock a single period from the Teacher Timetable page — built.**
`TeacherWeeklyGrid.tsx` gained an optional `onToggleLock` prop: hovering a
filled period now reveals a Lock/Unlock button, and a locked period shows
a small lock icon permanently (matching the Timetable page's own
convention). `TeacherTimetablePage.tsx` wires this to the exact same
`timetableApi.lockSlot` (`PATCH /timetable/slot/lock`) the Timetable
page's manual editor already uses — no new endpoint, no duplicated logic.
The printable sheet passes no `onToggleLock`, so it stays pure display,
unaffected. **Verified live:** locked Boys Teacher 10's Monday Science period
(Boys 3A) directly from his Teacher Timetable view, confirmed the lock
icon + toast + persisted `isLocked: true`, then unlocked it and confirmed
the icon disappeared — net state unchanged after the test.

**6. Off-screen tooltip on the Timetable page — fixed.** `ProblemFlag.tsx`
always anchored its popover's left edge to the trigger and grew rightward
(`absolute left-0`), so a flag near the grid's right edge (e.g. Friday's
column) overflowed off-screen and got clipped. Fixed with a
`useLayoutEffect` that measures the trigger's real position against
`window.innerWidth` when the popover opens and flips to `right-0` when
there isn't enough room — an 8px margin buffer, no change for flags that
already had room. **Verified live:** a real shortfall flag on Boys 7A
(previously at trigger x=1058 in a 1280px viewport, which would have
overflowed by 66px) now renders fully on-screen, right-aligned; a
left-side flag on the same class stayed left-aligned, unchanged.

**7. Gaps & Suggestions richer detail — root-cause breakdown built** (per
your explicit choice of Option 1 over cross-referencing/scenario-preview).
`GET /capacity-advisor/gap` now also returns `holders`: every teacher
currently eligible for the exact flagged (class, subject) pair, with their
real current/target — not just the fixable `candidates` it already
returned. `ClassGapFixSuggestions.tsx` (shared by the Timetable page's
inline popup and Gaps & Suggestions' Class view) now shows one of two
root causes when no fix is offered: **no eligible teacher anywhere**
(unchanged from before) vs. the new **capacity exhausted** case — every
eligible teacher is already at/over target, with each one's real
current/target shown, e.g. "Boys Teacher 12 30/30 — at target." This directly
systematizes the same demand-vs-capacity reasoning done by hand for the
tier-fairness investigation (item 32), now automatic for every shortfall.
**Verified live:** Boys 10A's English gap (Boys Teacher 12 exactly 30/30, the
sole eligible teacher) correctly showed the new capacity-exhausted
message with his real numbers — a genuine, reproducible example, not a
synthetic one.

**8. Bulk tier-assignment on the Subjects page — built.** Row checkboxes
(+ select-all) and a bulk-action bar that appears once ≥1 subject is
selected: pick Core-early or Light-later, click Apply, and every selected
subject gets one `PATCH /subjects/:id` call each (Promise.allSettled, so
one failure doesn't block the rest — partial success is reported
honestly, e.g. "3 of 4 updated, 1 failed"). No new backend endpoint —
`updateSubject` (item 23) already does a true partial merge, so each call
only ever touches `tier`. Deliberately excludes "Unconfirmed" from the
bulk options — clearing a tier back to unset isn't a real bulk use case.
**Verified live:** bulk-selected Diary + WRA, applied Core-early, got a
"2 subjects" success toast and confirmed both rows updated in the table;
immediately reverted both back to their real, confirmed Light-later tier
via a direct API call afterward — no residual change to real data.
*(Also fixed, same file: a pre-existing unrelated text bug — "won't guess
where it belongsin the day," missing a space — noticed while verifying
this work.)*

**9. Safety confirmation, explicit.** None of items 5-8 touch any
subject/teacher assignment on the currently-generated timetable, and none
trigger a regenerate:
- Item 5 (period lock) writes to a real `TimetableEntry.isLocked` flag —
  the exact same field/endpoint every other lock control in this app
  already writes to. It does NOT change which subject or teacher occupies
  that period, only whether it survives a *future* regenerate. Tested
  live and reverted, confirmed no residual change.
- Items 6 and 7 are read-only/display changes — zero data mutation of any
  kind.
- Item 8 writes to `Subject.tier`, which only affects the *soft
  preference* a future solve uses — it never retroactively touches any
  already-generated `TimetableEntry` row. Tested live and reverted.
- Disclosure: Phase 1 and Phase 3 verification did trigger several real
  Generate calls (Boys, Girls, Junior, multiple times) as explicit,
  intentional tests of the tier-fairness fix and the gap-detail feature —
  those were deliberate uses of the existing Generate button, not a side
  effect of any Phase 2/3 UI change. Current DB state reflects the last
  such regenerate per campus, all `OPTIMAL`, zero corruption.

`tsc --noEmit` clean on both Backend and web-admin after every item.

## 35. Girls campus intermittently returning wildly worse results (194, 101 unassigned vs. the expected ~23-28) — real production incident, root-caused and fixed (2026-07-31)

**Status:** ✅ RESOLVED.

**The report:** live testing after the Phase 1-3 work found Girls campus
producing dramatically inconsistent Generate results across separate
runs — 194 unassigned in one live banner, 101 in another, vs. the ~23-28
this session's own testing had been showing. Boys and Junior stayed
consistent throughout. Correctly flagged by Abdullah as most likely tied
to item 32's own watch-item (Girls' solve time already sitting close to
the 30s cap after `TIER_FAIRNESS_WEIGHT` was added).

**Investigated directly, not assumed:** repeated fresh Generates for Girls
(10 back-to-back at the old 30s cap) confirmed real instability — 2/10
landed on `FEASIBLE` instead of `OPTIMAL` — but only ranged 26-28
unassigned, nowhere near 101 or 194. Concurrent-load and CPU-starvation
tests (forcing 1 search worker instead of 8) also didn't reproduce the
reported magnitude — Girls solved in ~6s at `OPTIMAL` even resource-starved.

**Found the actual mechanism via a direct, isolated A/B test:** temporarily
forced the solver's time budget down to an artificial 2 seconds.
**With** `TIER_FAIRNESS_WEIGHT`'s `AddMaxEquality` term in the objective,
this produced **197 unassigned** — matching the live incident's reported
194 almost exactly. **Without** it, the identical 2-second cap gave a
stable **31 unassigned** across 3 repeated runs. This is the smoking gun:
the fairness term (added item 32, weighted 1000x below the shortfall
term) doesn't degrade gracefully under time pressure — it's a cliff.
`AddMaxEquality` over many classes' violation sums is expensive for
CP-SAT to reason about, and that cost was bleeding into the solver's
ability to even optimize the primary shortfall objective, despite the
huge weight gap meant to protect it. Real machine/load variance (this
session's dev machine vs. Abdullah's, whatever else was running at the
time) explains why the *exact same* live app could show healthy numbers
in one session and catastrophic ones in another — this was never a
data or capacity problem, purely a solver-search fragility problem.

**Fixed structurally in `solve.py`, not by just raising the timeout:**
`solve()` now runs in two phases.
- **Phase 1** optimizes shortfall + tier-violations + teacher-load
  *only* — the exact objective that existed before the fairness term,
  confirmed fast and reliable on its own (single-digit-to-teens seconds,
  even 1-worker-starved). 25s budget.
- **Phase 2** then hard-fixes phase 1's shortfall and tier-violation
  totals as equality constraints (so fairness refinement can never
  regress them, not even by one period), warm-starts from phase 1's
  exact assignment via `AddHint` (so it searches from a known-good point
  instead of cold), and only then searches for a more even distribution.
  20s budget. If phase 2 can't improve on phase 1 in time, phase 1's
  result is used directly — fairness is now strictly additive, never a
  risk to the core placement guarantee.
- **A second, subtler bug caught during this same fix, before it shipped:**
  phase 2 proving *its own* narrower sub-problem optimal doesn't mean the
  shortfall count itself was proven optimal — that was only ever as good
  as phase 1's own status. Naively reporting phase 2's status would have
  let a run whose actual placement quality was never certified show
  `OPTIMAL`. Fixed: overall status is `OPTIMAL` only if *both* phases
  independently reached it; any other outcome is honestly reported as
  `FEASIBLE`.

**Also fixed — solver status was silently computed but never surfaced
anywhere in the UI**, which is exactly why this inconsistency was invisible
before Abdullah caught it manually: `GenerateTimetableStats` (frontend
type) never declared the `solverDiagnostics` field the backend already
returned. Added it, and `TimetablePage.tsx`'s `generate()` now shows an
explicit amber warning — both a toast and a **persistent banner
indicator that survives past the toast's auto-dismiss** — whenever a
campus's result isn't proven optimal, naming the exact status and
explaining a re-run might find something better.

**Verified live, decisively:**
- Isolated A/B test at 2s cap: 197 (with fairness term) vs. 31 (without) —
  confirmed the fairness term as root cause, not general problem hardness
  or machine load.
- Stress-tested the *fixed* two-phase approach at an even harsher 2s+2s
  budget: 42-49 unassigned, honestly reported `FEASIBLE` — a graceful
  degradation, not a cliff, a ~4-5x improvement over the pre-fix 197 under
  equivalent severe pressure.
- Production timing (25s/20s) re-verified clean: Junior 0 unassigned,
  Boys 31 unassigned/`OPTIMAL`/tierViolations 120 (matching the
  documented baseline exactly), Girls 3/3 fresh runs all `OPTIMAL` at
  24-27 unassigned/tierViolations 148 (also matching baseline).
- Live browser click-through (real Generate button, real banner) on a run
  that itself hit `FEASIBLE` at phase 1's 25s cap: banner honestly showed
  "Not proven optimal (FEASIBLE)," and the actual total was still only 26
  unassigned — Boys 3A and Girls 1B screenshotted directly, both showing
  small, proportionate gaps, not the reported "heavy blanks across
  Periods 1-3."

**Trade-off, disclosed:** phase 1 + phase 2 running sequentially means a
worst-case Generate can now take up to ~45s (25s + 20s) instead of the
previous single-phase 30s cap — in practice this session's runs mostly
finished in 15-26s total, since phase 2 (warm-started, two of its three
objective terms already fixed) converges much faster than the original
single-phase fairness search did. This is an admin-facing async action
with a loading spinner already; a slower worst case in exchange for the
core guarantee never being at risk again is the right trade.

**Same-day follow-up — phase 2's own reliability, not just safety
(2026-07-31):** live testing found Boys hitting `FEASIBLE` too (40.5s,
26 unassigned), confirmed as the same mechanism, not campus-specific —
Junior (no specialist-teacher scarcity) never hits this, Girls and Boys
(both have real specialist-teacher scarcity, per item 32's root-cause
finding) both can. Instrumented phase 1 and phase 2 separately (temporary
per-phase logging, removed before shipping) across 6 fresh runs each on
both campuses at the original 20s phase-2 budget: **phase 1 was already
rock solid — 12/12 `OPTIMAL`, 4.5-9.8s every time.** Phase 2 was the real
bottleneck: `OPTIMAL` on 11/12, but even most of those successes used
16-20s of a 20s budget — proving max-equality optimality is a genuinely
harder search than finding a good value, even warm-started from phase 1's
solution. Raised `PHASE2_TIME_LIMIT_SECONDS` from 20 to 35 and re-ran the
identical per-phase test: **12/12 `OPTIMAL` on Girls, 12/12 on Boys**,
every phase 2 completion now landing comfortably under the new cap (max
observed 26.8s, well short of 35s) instead of pinned against it. Re-ran
once more through the actual API (not just internal instrumentation) as a
final check: **Girls 5/5 `OPTIMAL`, Boys 5/5 `OPTIMAL`** — 22 consecutive
`OPTIMAL` results total across both verification passes, zero `FEASIBLE`.
Debug instrumentation fully removed before this was called done —
`solve.py` has no leftover print statements or temporary env-var hooks.

**Same-day correction #3 (2026-07-31) — the 35s phase-2 budget was
itself wrong, on real hardware:** live use showed Generate taking
56-59 seconds and STILL landing on `FEASIBLE` — worse on both dimensions
than intended. Root cause: this solver runs on the same machine as
whatever else is open day to day (checked directly with `Get-Process` —
Chrome and VS Code were the top CPU consumers during testing), not a
dedicated server, so "reliably reaches OPTIMAL" was never a fixed
target — it moves with ordinary desktop load. Chasing it with an
ever-larger timeout doesn't converge to a fix, just to longer waits.

**Corrected approach:** stopped trying to guarantee phase 2 (fairness)
reaches OPTIMAL at all — it's a polish on top of an already-correct
phase 1 result, safe to leave unfinished (`FEASIBLE`) since that never
costs placement quality, only evenness. Trimmed phase 2 to 10s. Tried
trimming phase 1 too (15s, then 20s) to cut total wait further, but
live-tested both under real (loaded) conditions and found genuine
failures — 15s produced 45 unassigned (vs. the usual 21-29) on Girls;
20s produced 110 unassigned on Boys — because phase 1's OWN shortfall
minimization hadn't finished, not just its optimality proof. Phase 1's
correctness is the one thing that can never be gambled with, so it's
kept at the only value with a fully clean track record under real load:
25s. Final: `PHASE1_TIME_LIMIT_SECONDS = 25`,
`PHASE2_TIME_LIMIT_SECONDS = 10` (worst case ~35s, vs. the 60s that
caused the complaint).

**Re-verified fresh, final config, real API:** Junior 0 unassigned/
`OPTIMAL`/1.1s. Girls `FEASIBLE`/18.3s/26 unassigned. Boys `FEASIBLE`/
15.2s/25 unassigned — both totals now far faster than the 56-59s
complaint, both unassigned counts matching the documented healthy
baseline (~23-29), confirming the underlying shortfall (the only thing
that actually matters for real placement) is solved even when the
fairness proof doesn't finish in time. All debug instrumentation used to
diagnose this removed before shipping.

**Same-day redesign (2026-07-31) — replaced timeout-tuning entirely with
a structural fix, after correction #3 still wasn't good enough live:**
Abdullah reported Generate still taking 36s and landing on `FEASIBLE`
with 42 unassigned on Girls even at the "safe" 25s/10s config, and
flagged that priority-subject (tier) placement needed protecting
explicitly, not just shortfall. Root problem: a single combined weighted
objective (shortfall + tier + teacher-load all in one `Minimize()`)
forces CP-SAT to jointly reason about all three at once, and this
school's roster has heavy solution-space symmetry (item 32 — many
different assignments share the same optimal value), which is exactly
what makes PROVING joint optimality slow and unpredictable. No timeout
was ever going to fix that reliably.

**Replaced the two-phase design with four sequential single-objective
stages**, each hard-fixing what it achieves before the next stage starts
(a structural guarantee of priority order, not just a weight):
**A. class-subject shortfall** (10s budget) → **B. tier-window violations**
(8s, priority-subjects-first, its own dedicated stage now) → **C.
teacher-load shortfall** (6s) → **D. fairness** (6s, item 32). Each stage
warm-starts from the previous stage's exact solution via `AddHint`.
Worst case ~30s total, but proving a single linear sum's optimum is a
much smaller search than the old joint objective, so stages typically
finish well under their caps.

**Verified live, real API, under the same real system load Abdullah was
testing on:** Girls 4/4 fresh runs — 14.5-17.8s (vs. the 36-59s
complaint), 24-31 unassigned (healthy baseline), tierWindowViolations
148-152 (matching the documented 148 baseline almost exactly). Boys 4/4 —
13.6-16.9s, 25-27 unassigned, tierWindowViolations **120 every single
run** (exact match to baseline). Junior unaffected — 0 unassigned,
`OPTIMAL`, 1.7s. `tsc --noEmit` clean, no leftover debug instrumentation.
The now-unused combined-objective weight constants
(`CLASS_SUBJECT_SHORTFALL_WEIGHT` etc.) were removed rather than left
dead, since each stage's single-term objective doesn't need them.

**Same-day live follow-up (2026-07-31/08-01) — confirmed the stage
design is sound, found the remaining variance is genuinely
machine-load-driven, not a code bug:** Abdullah caught a live run at 21s
still `FEASIBLE` and specifically flagged that priority-subject placement
"sometimes doesn't come to the top." Investigated with real per-stage
instrumentation (temporary, removed before shipping) rather than
assuming: traced a live Girls 1A blank-cell screenshot directly against
the DB and confirmed it was a Games-duty shortfall (item 12, a separate,
already-accepted mechanism unrelated to solve.py), not a tier-placement
failure — that specific class's curriculum shortfall was 0, and its
CORE_EARLY subjects were genuinely landing early on non-Games-shortfall
days. Confirmed stage A (shortfall) is rock solid every time (0 objective,
sub-1s to ~7s). But stage B (tier placement, the priority-subjects stage)
showed real run-to-run quality variance — 148 to 188 tier violations
across otherwise-identical runs.

Tried the obvious fix — reallocating idle time from stage A/C (which
consistently finish in seconds) to stage B (8s → 12s). **This made stage
B's results WORSE (182-202), not better**, with MORE time given — the
tell that this isn't a time-budget problem at all: the shared machine's
real available throughput is fluctuating faster than any static
time-split can chase. Reverted to the split with the best directly
observed results and stopped tuning individual numbers further — proven
not to converge, chasing a moving target instead of a fix.

**Final, honest state as of this session's end:** shortfall (real
curriculum placement) is unconditionally solid — 0 in every test, this
session and prior. Speed is consistently ~14-20s (vs. the 56-59s that
started this investigation). Tier-window placement (priority subjects)
is meaningfully protected structurally (its own dedicated stage, can
never be traded away for shortfall or teacher-load) but its *exact*
quality now varies with real machine load — recent live runs measured
132-170 tier violations against a 120/148 (Boys/Girls) best-case
baseline, roughly 10-15% above optimal rather than exactly matching it
every run. This is disclosed plainly, not smoothed over: further
precision on this specific number would require either a dedicated,
less-loaded machine to run the solver on, or accepting a slower total
Generate time to buy the stage more search room — a real trade-off for
Abdullah to weigh, not something resolved by more code changes tonight.

## 36. Follow-up hardening — size-aware time budgets, Games popup, WebAdmin explanation audit (2026-08-01)

**Status:** ✅ RESOLVED. Three separate asks from the same conversation,
all verified against the Generate button specifically (explicitly
flagged as the one thing that must not break) before and after.

**1. Solver time budgets now scale with problem size, not a fixed
number.** The four stage budgets (item 35) were tuned against today's
largest campus (Girls, ~3600 CP-SAT variables) — fixed constants that
would silently stop being enough if the school's roster grows
meaningfully in the future, quietly reintroducing the exact
FEASIBLE-frequency problem item 35 just fixed, with no warning it was
coming. `solve.py` now computes real `variable_count` from the actual
built model and scales every stage's budget proportionally above a
`REFERENCE_VARIABLE_COUNT` (today's Girls size, the calibration point).
Below that size — every campus that exists today — the scale factor is
clamped to 1.0, so behavior is byte-for-byte identical to the tuned
values already verified. Re-tested all 3 campuses after this change:
Junior 0 unassigned/`OPTIMAL`, Girls/Boys in the same healthy 23-30 range
as before, `tsc --noEmit` clean.

**2. Games shortfall popup.** Requested explicitly: when Generate can't
fully schedule Games, a real popup (not a toast — toasts auto-dismiss in
3s and can't hold a persistent link) should tell the admin plainly and
point at the existing Warnings breakdown. `TimetablePage.tsx` now shows a
`Modal` whenever `classSubjectShortfalls` contains any Games entries,
naming the real total-periods/total-classes numbers, explaining it's a
staffing-capacity limit (§17) and not a scheduling bug, with a "View in
Warnings" button (`navigate('/dashboard/warnings')`) and a plain
"Dismiss". Verified live (Playwright): popup appears with real numbers,
both buttons work, navigation lands on the correct page.

**3. WebAdmin-wide audit for missing hover/click explanations.**
Requested explicitly: every "problem-looking" element anywhere in the
app should have a clear, consistent way to see why. Audited every page
(grep for warning-colored classes, cross-checked against the existing
`ProblemFlag` pattern) rather than guessing which pages needed work.
Found and fixed 2 real gaps:
- **Classes page** — the "Subjects Count" column showed a bare `0` with
  no explanation at all (the exact gap the original master spec §13
  flagged: "explain why in one sentence each"). Added a `ProblemFlag`
  using the identical reason logic the Warnings page's own "no subjects
  seeded" section already uses server-side (`isActive` → "no quota data
  seeded yet" vs. "section is marked inactive"), so the two surfaces
  never drift apart.
- **Teachers list** — the mobile-login status dot (red/green) only had a
  native HTML `title` attribute — invisible on touch devices and the only
  place in the app still using that pattern instead of the click-based
  `ProblemFlag` every other flagged state uses. Upgraded the red
  ("no account yet") case to `ProblemFlag`; the green/healthy case still
  needs no explanation, so it was left as a plain dot.
Checked and found already adequate, no changes needed: Capacity Advisor
(full inline prose explanations, arguably richer than a hover would be),
Dashboard (no warning-styled elements exist), Guidelines/Settings/
printable sheet (no warning states), Gaps & Suggestions (reuses the
already-audited shared components). Verified both fixes live
(Playwright): Classes page's Prep A row shows the flag with the correct
inactive-section reason; Teachers page renders 43 flag triggers
correctly across TO_BE_HIRED badges and no-mobile-account dots.

**Final Generate-button regression check (explicitly requested, run
last):** Junior 0 unassigned/`OPTIMAL`, Girls 27 unassigned/`FEASIBLE`/
22.6s, Boys 24 unassigned/`FEASIBLE`/31.9s — all within the established
healthy range, `tsc --noEmit` clean on both Backend and web-admin. Not
broken by any of the three additions above.
