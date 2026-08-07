Update: the school has now confirmed every open question from the last round. I've replaced `APS_Timetable_Master_Spec.md` in the root with the final version — every section that previously showed conflicting numbers now has a single ✅ confirmed value (see §0, §2, §5, §6, §8, §14 specifically). Please re-read the whole file, since several sections changed, not just the ones that were previously flagged.

You're clear to proceed with everything, in this order — still confirm with me after each step before moving to the next:

1. Wipe the current placeholder/test data (the 57-teacher/52-class seed with fake entries like "ahmad"/"ai sir"/"abdullah") and reseed using the confirmed real data in §2 (33 total sections: Junior 8, Girls 14, Boys 11), §5 (subject quotas, including Pak Study for Classes 8-10 and Geography/SS for Classes 1-7), and §6 (the real teacher roster, including `hiring_status = TO_BE_HIRED` for the TBH placeholders). Do not seed Class 1C, Class 3B/3C, or "11 CS" — these are confirmed inactive/stale.

2. Implement the subject priority tiers exactly as described in §8, including the Period-4-is-always-Games rule for Group A classes (1-7 and 11 Medical) vs. the no-fixed-slot rule for Group B (8-10). Build this as a hard constraint using the period *window* (not a single exact period) — §8 explains why that's sufficient even with one teacher covering many sections.

3. Confirm whether our existing timetable algorithm is proactive/correct-by-construction or reactive (generate-then-check) per §12's design principle — if it's the latter, this is the point to fix that before we rely on it for real scheduling.

4. Once 1-3 are solid, move to the frontend work in §13: working Edit/Delete detail views for Teachers and Classes, the new "warnings / to-be-hired" dashboard page, the per-teacher printable-sheet export, and wiring the existing Timetable page's campus→class→teacher-view selector to the real solver with infeasibility messages surfaced in the UI.

5. Keep Junior/Girls/Boys strictly separate everywhere in the UI (§13) — no ambiguous shared lists where e.g. a Boys "10A" and Girls "10A" could be confused.

As before: go step by step, stop for my confirmation after each numbered item, and flag anything that still looks ambiguous rather than guessing.
