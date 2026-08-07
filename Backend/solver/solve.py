"""
Correct-by-construction timetable solver (§12 of APS_Timetable_Master_Spec.md).

One boolean decision variable per (class, slot, teacher, subject) — not per
(class, slot, teacher) alone, since a teacher can be eligible for more than
one subject in the same class (e.g. Sir Ishfaq: Maths AND Islamiyat, both
for Boys Class 5A) and the per-subject quota constraint can't be enforced
without that dimension.

Every hard rule from §12 is encoded as an actual CP-SAT constraint, not a
post-hoc check:
  1. at most one (teacher, subject) per (class, slot) — HARD
  2. class-subject quota — SOFT via a shortfall slack variable, so a
     genuinely unfillable requirement (PENDING_QUESTIONS.md item 1) reports
     its exact shortfall instead of making the whole solve fail
  3. no teacher double-booked, across all classes in this campus, per slot
     — HARD
  4. teacher weekly total == target — SOFT via shortfall, same reasoning
  5. §8 tier windows / Period-4-Games rule — SOFT (2026-07-25 decision,
     PENDING_QUESTIONS.md item 6): most teachers cover the same
     tier-windowed subject across enough classes that a hard window is
     mathematically impossible to satisfy (a teacher can only occupy one
     of the window's ~15-20 weekly time-slots, no matter how many classes
     want her there). Variables exist for every slot; placing a subject
     outside its preferred window costs a penalty in the objective instead
     of being forbidden outright — "maximize early/late placement" rather
     than an absolute wall. Confirmed as the permanent design 2026-07-25
     (PENDING_QUESTIONS.md item 6).
     A secondary fairness stage (2026-07-29 finding, redesigned 2026-07-31
     into its own sequential stage — see the stage-design comment near
     `solve()`) minimizes the worst single class's violation count, so this
     roster-driven, mathematically-fixed total spreads evenly across
     classes instead of concentrating on whichever few the solver finds
     cheapest — never changes the total itself, only who bears it.
  6. eligibility — variables only exist for real TeacherSubject triples —
     HARD, never softened
  7. shortfalls AND tier-window violations ARE the "report exactly what's
     unfillable / imperfect" mechanism §12 point 7 asks for
  8. same-subject-same-day cap (PENDING_QUESTIONS.md item 3b) — HARD.
     Nothing previously stopped a class's whole weekly quota for a subject
     from clustering onto one or two days (e.g. Geography/SS twice on
     Monday, zero the rest of the week) as long as the weekly total came
     out exact. Capped at ceil(quota / 5) per day — 1/day for every
     currently-confirmed quota (all <= 5/week), rising only if a subject's
     quota genuinely can't fit at 1/day. Always satisfiable in isolation
     (any N periods can be spread at <= ceil(N/5) per day across 5
     weekdays), so this can't make a previously-feasible quota infeasible
     on its own — it only interacts with the existing shortfall slack from
     constraint 2 if OTHER constraints (eligibility, teacher availability)
     also come into play, in which case the same-day cap yielding to a
     documented shortfall is the correct, honest outcome, not a bug.
  9. Games-protected lectures (PENDING_QUESTIONS.md item 14, generalized to
     an explicit per-class field in item 30) — HARD, unlike point 5's soft
     tier windows, but only actually engages for classes where Games itself
     is a requirement here (Junior — Girls/Boys never send Games as a
     requirement at all, it's handled by the separate duty scheduler
     instead). When a class carries `gamesProtectedLectures` (e.g. Pre
     Nursery: lecture 3+7, Nursery: lecture 4, KG: lecture 5), Games gets
     variables ONLY at those lecture indices and every OTHER subject on
     that same class gets NO variables at those indices — enforced purely
     by never creating the competing variable, the same mechanism as
     eligibility (point 6), so there is no way for the constraint to be
     "violated," only for the class's total schedule to come up short if
     that's ever mathematically forced (it isn't currently — every Junior
     class's weekly total exactly equals its available slot count, so this
     only fixes WHICH slot Games lands in, it doesn't remove any
     previously-usable capacity).
  10. Granular Lock (PENDING_QUESTIONS.md item 24) — HARD. `lockedSlots`
      names (class, slot) pairs already decided by a row-level lock outside
      this solve (a single locked period, or a whole locked day for one
      teacher) — the class itself isn't Locked (point 1's whole-class
      freeze, §13), just this one slot. No variable is created for that
      exact (class, slot) at all (nothing can compete with what's already
      there), and no variable is created for any of that slot's teacher(s)
      at ANY other class's same slot either (so the solver can never
      double-book someone whose time is already spoken for by a row it will
      never touch). Same "no variable, no violation possible" mechanism as
      eligibility (point 6) and point 9.

Never returns a schedule that violates 1/3/6/8/9/10 — those have no slack.
2, 4, and 5 are allowed to come up short, and every time they do it's
reported by name and amount, never silently.
"""
import math
import time
from collections import defaultdict

from ortools.sat.python import cp_model

from schemas import (
    Assignment,
    ClassSubjectShortfall,
    SolveRequest,
    SolveResponse,
    SolveStats,
    TeacherShortfall,
)

# Priority order — curriculum requirements first, then tier-window
# placement, then teacher load, then fairness. Originally enforced as one
# combined weighted-sum objective (big gaps between tiers so higher
# priorities always dominated lower ones); superseded 2026-07-31 by
# sequential single-objective stages (below) that hard-fix each priority
# before the next one runs, which enforces the same ordering structurally
# instead of just numerically, and is both faster and more reliable to
# prove (see the stage-design comment further down for why).

# 2026-07-31 — root cause of a real production incident, found and fixed
# same day. The watch-item flagged 2026-07-29 (Girls' solve time nearing the
# old 30s cap) turned out to be the tip of something much worse: under real
# time pressure, TIER_FAIRNESS_WEIGHT's AddMaxEquality term doesn't degrade
# gracefully — it's a cliff. Isolated by direct A/B test at an artificially
# brutal 2s cap: WITH the fairness term, Girls returned 197 unassigned
# (matching the live incident's reported 194); WITHOUT it, the exact same
# 2s cap gave a stable 31 unassigned across 3 runs. AddMaxEquality over many
# classes' violation sums is expensive for CP-SAT to reason about, and that
# cost was apparently bleeding into the solver's ability to even optimize
# the FAR more important shortfall term first, despite the 1000x weight gap
# — a "nice to have" fairness improvement was allowed to endanger the one
# guarantee that actually matters (periods get filled).
#
# Fixed structurally, not just by raising the timeout further: solve() now
# runs in two phases. Phase 1 optimizes shortfall + tier-violations +
# teacher-load ONLY (the exact objective that existed before the fairness
# term, proven fast and reliable — single-digit-to-teens seconds even under
# artificial 1-worker starvation). Phase 2 then HARD-FIXES those two totals
# at whatever phase 1 achieved (so fairness can never regress them, not
# even by one period) and searches ONLY for a more even distribution among
# solutions that already match phase 1's quality, warm-started from phase
# 1's exact assignment via AddHint so it starts from a known-good point
# instead of cold. If phase 2 can't improve on phase 1 within its budget,
# phase 1's result is used directly — fairness is now strictly additive,
# never a risk to the core guarantee.
#
# Same-day follow-ups #1-#3 (2026-07-31, all superseded by the redesign
# below): repeatedly tried tuning a single "phase 1" timeout up and down
# (15s, 20s, 25s, then phase 2 up to 35s) chasing reliable convergence.
# Each round "worked" on whatever machine/load happened to be measuring it
# and then failed again under different real conditions — 25s alone still
# produced live FEASIBLE results with 42 unassigned. Timeout-tuning a
# single combined objective was never going to converge, because the
# actual problem was the OBJECTIVE SHAPE, not the number: minimizing
# shortfall + tier-violations + teacher-load as one weighted sum forces
# CP-SAT to jointly reason about all three at once, and this school's
# roster has heavy solution-space symmetry (item 32/PENDING_QUESTIONS.md —
# many different assignments share the same optimal value), which is
# exactly what makes PROVING joint optimality slow and unpredictable, even
# though FINDING a good value for any one term alone is fast.
#
# Real fix (2026-07-31): decomposed into sequential single-objective
# stages instead of chasing a bigger timeout on one combined objective.
# Each stage optimizes exactly ONE thing, hard-fixes what it achieved
# before the next stage starts (so a later stage can never regress an
# earlier, higher-priority one — the actual mechanism guaranteeing
# priority order, not just weighting), and warm-starts from the previous
# stage's exact solution via AddHint. In priority order:
#   A. class-subject shortfall (curriculum requirements — the ONE thing
#      that must never be compromised)
#   B. tier-window violations (CORE_EARLY/LIGHT_LATE placement — the
#      priority-subjects-first rule) — its own dedicated stage now,
#      instead of being entangled with A and C in one search
#   C. teacher weekly-load shortfall
#   D. fairness (evenness of B's violations across classes, item 32)
# Each stage has a short, bounded budget — proving a single linear sum's
# optimum is a much smaller search than the old joint objective, so this
# is both faster AND more reliable, not a trade-off between the two.
# Tried reallocating slack from A/C to B (8/12/6/4) after seeing stage B
# hit 188 once — made it WORSE (182-202) with MORE time given, not better.
# That's the tell that this isn't a budget problem anymore: the shared
# machine's real available throughput is fluctuating faster than any
# static split of a fixed total can chase (confirmed directly — Chrome/VS
# Code were the top CPU consumers earlier the same day). Reverted to the
# split with the best directly-observed results (148-188, vs. 182-202) —
# further timeout tuning stops here; it was chasing a moving target, not
# converging on one.
STAGE_A_SHORTFALL_BASE_SECONDS = 10
STAGE_B_TIER_BASE_SECONDS = 8
STAGE_C_TEACHER_BASE_SECONDS = 6
STAGE_D_FAIRNESS_BASE_SECONDS = 6

# 2026-08-01 — future-proofing, requested explicitly: the four numbers
# above were tuned against TODAY's largest campus (Girls, ~3600 decision
# variables). They're fixed constants, so if the school's roster grows
# meaningfully — more classes, more teachers, more subjects — the problem
# gets combinatorially harder and these same numbers would quietly stop
# being enough, reintroducing the exact FEASIBLE-frequency problem this
# whole redesign just fixed, with no signal that it's about to happen.
# Scaled by actual variable count instead of left fixed: REFERENCE_VARIABLE_COUNT
# is today's Girls size, the calibration point where the base numbers above
# are known-good from direct testing. Below that size (Boys, Junior — both
# smaller), stages run at the same base numbers, unchanged from today's
# verified behavior. Above it, every stage's budget grows proportionally
# with however much bigger the actual problem is, so a future roster
# doesn't silently inherit numbers sized for a smaller school.
REFERENCE_VARIABLE_COUNT = 3600


def _scaled_time_limit(base_seconds: float, variable_count: int) -> float:
    scale = max(1.0, variable_count / REFERENCE_VARIABLE_COUNT)
    return base_seconds * scale


def _preferred_lecture_indices(
    subject_name: str, tier: str, games_protected_lectures: list[int]
) -> set[int] | None:
    """None means no preference at all (subject tier was never confirmed, e.g. History)."""
    if subject_name == "Games":
        # Games variables only ever exist here for classes where Games is a
        # real requirement (Junior) — Girls/Boys never send it, so this
        # branch only matters for Junior's hard-protected classes (point 9).
        # Every Games variable that exists for them already sits inside
        # games_protected_lectures by construction, so reporting against the
        # real mandatory window (instead of the generic {5,6,7} default)
        # keeps the tier-violation stat honest at 0 here.
        if games_protected_lectures:
            return set(games_protected_lectures)
        return {5, 6, 7}
    if tier == "CORE_EARLY":
        return {1, 2, 3, 4} - set(games_protected_lectures)
    if tier == "LIGHT_LATE":
        return {5, 6, 7}
    return None


def solve(request: SolveRequest) -> SolveResponse:
    start = time.monotonic()
    model = cp_model.CpModel()

    # x[(classId, slot.slotId, teacherId, subjectId)] -> BoolVar
    x: dict[tuple[str, str, str, str], cp_model.IntVar] = {}
    slot_by_id = {slot.slotId: slot for slot in request.slots}

    # Indices built alongside variable creation, so the constraints below
    # never have to scan the full variable set.
    vars_by_class_slot: dict[tuple[str, str], list] = defaultdict(list)
    vars_by_teacher_slot: dict[tuple[str, str], list] = defaultdict(list)
    vars_by_teacher: dict[str, list] = defaultdict(list)
    vars_by_class_subject: dict[tuple[str, str], list] = defaultdict(list)
    vars_by_class_subject_day: dict[tuple[str, str, str], list] = defaultdict(list)
    tier_violation_vars: list = []
    tier_violation_vars_by_class: dict[str, list] = defaultdict(list)

    eligible_teacher_ids: dict[tuple[str, str], list[str]] = defaultdict(list)
    for teacher in request.teachers:
        for elig in teacher.eligibility:
            eligible_teacher_ids[(elig.classId, elig.subjectId)].append(teacher.id)

    # Point 10 — Granular Lock. locked_class_slots marks exactly which
    # (class, slot) pairs are already decided outside this solve; no
    # variable is ever created for them. locked_teacher_slots marks every
    # (teacherId, slot) that's already spoken for by one of those rows —
    # checked against EVERY class's candidate variables, not just the one
    # the lock belongs to, so the same person can't be double-booked
    # elsewhere at that exact time.
    locked_class_slots: set[tuple[str, str]] = set()
    locked_teacher_slots: set[tuple[str, str]] = set()
    for locked in request.lockedSlots:
        locked_class_slots.add((locked.classId, locked.slotId))
        for teacher_id in locked.teacherIds:
            locked_teacher_slots.add((teacher_id, locked.slotId))

    for cls in request.classes:
        # The hard wall (point 9) only ever applies to classes where Games
        # itself is a real requirement here (Junior — Girls/Boys never send
        # Games as a requirement at all, it's handled by the separate duty
        # scheduler instead). For everyone else, gamesProtectedLectures is
        # only a soft CORE_EARLY-narrowing signal via _preferred_lecture_indices,
        # never an absolute block — a class protecting period 4 without
        # Games in its own requirements must never have every OTHER subject
        # hard-forbidden from period 4, only soft-penalized outside its window.
        has_games_requirement = any(r.subjectName == "Games" for r in cls.requirements)
        hard_wall_slots = set(cls.gamesProtectedLectures) if (cls.gamesProtectedLectures and has_games_requirement) else None

        for req in cls.requirements:
            preferred_idx = _preferred_lecture_indices(req.subjectName, req.tier, cls.gamesProtectedLectures)
            teacher_ids = eligible_teacher_ids.get((cls.id, req.subjectId), [])

            # Every slot is a candidate now (§8 is a preference, not a wall)
            # — only real teacher eligibility restricts the variable set,
            # except for point 9's Junior Games hard slots and point 10's
            # Granular Lock below.
            is_games = req.subjectName == "Games"
            for slot in request.slots:
                if (cls.id, slot.slotId) in locked_class_slots:
                    continue  # this exact class-slot is already decided by a locked row
                if hard_wall_slots is not None:
                    in_hard_slot = slot.lectureIndex in hard_wall_slots
                    # Games may ONLY use its hard slots; every other subject
                    # on this class may use every slot EXCEPT them — no
                    # variable is created for the forbidden side either way,
                    # so nothing can ever compete for the reserved slot.
                    if is_games and not in_hard_slot:
                        continue
                    if not is_games and in_hard_slot:
                        continue
                for teacher_id in teacher_ids:
                    if (teacher_id, slot.slotId) in locked_teacher_slots:
                        continue  # this teacher is already committed elsewhere at this exact slot
                    key = (cls.id, slot.slotId, teacher_id, req.subjectId)
                    var = model.NewBoolVar(f"x_{cls.id}_{slot.slotId}_{teacher_id}_{req.subjectId}")
                    x[key] = var
                    vars_by_class_slot[(cls.id, slot.slotId)].append(var)
                    vars_by_teacher_slot[(teacher_id, slot.slotId)].append(var)
                    vars_by_teacher[teacher_id].append(var)
                    vars_by_class_subject[(cls.id, req.subjectId)].append(var)
                    vars_by_class_subject_day[(cls.id, req.subjectId, slot.day)].append(var)
                    if preferred_idx is not None and slot.lectureIndex not in preferred_idx:
                        tier_violation_vars.append(var)
                        tier_violation_vars_by_class[cls.id].append(var)

    # Constraint 1 — at most one (teacher, subject) per (class, slot). Hard.
    for var_list in vars_by_class_slot.values():
        model.Add(sum(var_list) <= 1)

    # Constraint 3 — no teacher double-booked in the same slot. Hard.
    for var_list in vars_by_teacher_slot.values():
        model.Add(sum(var_list) <= 1)

    # Constraint 2 — class-subject quota. Soft (shortfall slack).
    class_subject_shortfall_vars: dict[tuple[str, str], cp_model.IntVar] = {}
    for cls in request.classes:
        for req in cls.requirements:
            relevant = vars_by_class_subject.get((cls.id, req.subjectId), [])
            shortfall = model.NewIntVar(0, req.periodsPerWeek, f"shortfall_{cls.id}_{req.subjectId}")
            model.Add(sum(relevant) + shortfall == req.periodsPerWeek)
            class_subject_shortfall_vars[(cls.id, req.subjectId)] = shortfall

    # Constraint 8 — same-subject-same-day cap. Hard (see module docstring
    # for why this can't introduce new infeasibility on its own).
    all_days = {slot.day for slot in request.slots}
    for cls in request.classes:
        for req in cls.requirements:
            max_per_day = math.ceil(req.periodsPerWeek / 5) if req.periodsPerWeek > 0 else 0
            for day in all_days:
                day_vars = vars_by_class_subject_day.get((cls.id, req.subjectId, day), [])
                if day_vars:
                    model.Add(sum(day_vars) <= max_per_day)

    # Constraint 4 — teacher weekly total == target. Soft (shortfall slack).
    teacher_shortfall_vars: dict[str, cp_model.IntVar] = {}
    for teacher in request.teachers:
        relevant = vars_by_teacher.get(teacher.id, [])
        shortfall = model.NewIntVar(0, teacher.targetPeriodsPerWeek, f"tshortfall_{teacher.id}")
        model.Add(sum(relevant) + shortfall == teacher.targetPeriodsPerWeek)
        teacher_shortfall_vars[teacher.id] = shortfall

    def _run_stage(objective_terms, time_limit, hint_values=None):
        """One lexicographic stage: minimize objective_terms alone, warm-
        started from the previous stage's exact assignment if given. The
        caller is responsible for hard-fixing whatever this stage achieves
        before building the next one, so later stages can never regress it."""
        model.Minimize(sum(objective_terms) if objective_terms else 0)
        model.clear_hints()
        if hint_values is not None:
            for key, var in x.items():
                model.AddHint(var, hint_values[key])
        stage_solver = cp_model.CpSolver()
        stage_solver.parameters.max_time_in_seconds = time_limit
        stage_solver.parameters.num_search_workers = 8
        stage_status = stage_solver.Solve(model)
        return stage_solver, stage_status

    # Sized once, from the real model just built — not a guess, not tied to
    # today's specific campuses (see REFERENCE_VARIABLE_COUNT comment).
    variable_count = len(x)

    # Stage A — class-subject shortfall alone. The one thing that must
    # never be compromised for the sake of anything below it. No weight
    # needed — a single-term objective's minimum doesn't depend on scale.
    solver, status = _run_stage(
        list(class_subject_shortfall_vars.values()),
        _scaled_time_limit(STAGE_A_SHORTFALL_BASE_SECONDS, variable_count),
    )
    solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    final_solver = solver
    # Reporting honesty: overall "OPTIMAL" must mean every stage that ran
    # was independently proven optimal, not just the last one — a later
    # stage succeeding says nothing about whether an earlier, hard-fixed
    # stage was itself fully proven (it might have only been FEASIBLE).
    overall_optimal = status == cp_model.OPTIMAL

    if solved:
        shortfall_total = sum(solver.Value(v) for v in class_subject_shortfall_vars.values())
        model.Add(sum(class_subject_shortfall_vars.values()) == shortfall_total)
        stage_a_x_values = {key: solver.Value(var) for key, var in x.items()}

        # Stage B — tier-window violations (priority-subjects-first, §8),
        # its own dedicated stage now instead of sharing an objective with
        # shortfall/teacher-load. Hard-fixing stage A first means this can
        # only ever choose WHICH placement achieves the same shortfall,
        # never trade shortfall away for better placement.
        solver, status = _run_stage(
            tier_violation_vars, _scaled_time_limit(STAGE_B_TIER_BASE_SECONDS, variable_count), stage_a_x_values
        )
        stage_solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        overall_optimal = overall_optimal and status == cp_model.OPTIMAL
        if stage_solved:
            final_solver = solver
            tier_violation_total = sum(solver.Value(v) for v in tier_violation_vars)
            if tier_violation_vars:
                model.Add(sum(tier_violation_vars) == tier_violation_total)
            stage_b_x_values = {key: solver.Value(var) for key, var in x.items()}

            # Stage C — teacher weekly-load shortfall.
            solver, status = _run_stage(
                list(teacher_shortfall_vars.values()),
                _scaled_time_limit(STAGE_C_TEACHER_BASE_SECONDS, variable_count),
                stage_b_x_values,
            )
            stage_solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
            overall_optimal = overall_optimal and status == cp_model.OPTIMAL
            if stage_solved:
                final_solver = solver
                teacher_shortfall_total = sum(solver.Value(v) for v in teacher_shortfall_vars.values())
                model.Add(sum(teacher_shortfall_vars.values()) == teacher_shortfall_total)
                stage_c_x_values = {key: solver.Value(var) for key, var in x.items()}

                # Stage D — fairness (item 32): spread stage B's now-fixed
                # total evenly across classes instead of leaving it wherever
                # stage B happened to land it.
                max_class_tier_violations = model.NewIntVar(0, len(request.slots), "max_class_tier_violations")
                if tier_violation_vars_by_class:
                    model.AddMaxEquality(
                        max_class_tier_violations,
                        [sum(v) for v in tier_violation_vars_by_class.values()],
                    )
                solver, status = _run_stage(
                    [max_class_tier_violations],
                    _scaled_time_limit(STAGE_D_FAIRNESS_BASE_SECONDS, variable_count),
                    stage_c_x_values,
                )
                stage_solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
                overall_optimal = overall_optimal and status == cp_model.OPTIMAL
                if stage_solved:
                    final_solver = solver
            else:
                overall_optimal = False
        else:
            overall_optimal = False

    # Any non-optimal outcome is reported as FEASIBLE (the standard CP-SAT
    # term for "valid but not certified best") regardless of which stage
    # fell short — a genuinely unsolved request (solved=False) still gets
    # its own real status name (e.g. INFEASIBLE) from stage A directly.
    final_status_name = "OPTIMAL" if overall_optimal else ("FEASIBLE" if solved else solver.StatusName(status))

    assignments: list[Assignment] = []
    tier_violation_count = 0
    if solved:
        for (class_id, slot_id, teacher_id, subject_id), var in x.items():
            if final_solver.Value(var) == 1:
                slot = slot_by_id[slot_id]
                assignments.append(
                    Assignment(
                        classId=class_id,
                        day=slot.day,
                        periodId=slot.periodId,
                        teacherId=teacher_id,
                        subjectId=subject_id,
                    )
                )
        tier_violation_count = sum(final_solver.Value(v) for v in tier_violation_vars)

    class_by_id = {c.id: c for c in request.classes}

    class_subject_shortfalls = []
    for (class_id, subject_id), shortfall_var in class_subject_shortfall_vars.items():
        shortfall_value = final_solver.Value(shortfall_var) if solved else 0
        if shortfall_value > 0:
            req = next(r for r in class_by_id[class_id].requirements if r.subjectId == subject_id)
            class_subject_shortfalls.append(
                ClassSubjectShortfall(
                    classId=class_id,
                    className=class_by_id[class_id].name,
                    subjectId=subject_id,
                    subjectName=req.subjectName,
                    required=req.periodsPerWeek,
                    scheduled=req.periodsPerWeek - shortfall_value,
                    shortfall=shortfall_value,
                )
            )

    teacher_by_id = {t.id: t for t in request.teachers}
    teacher_shortfalls = []
    for teacher_id, shortfall_var in teacher_shortfall_vars.items():
        shortfall_value = final_solver.Value(shortfall_var) if solved else 0
        if shortfall_value > 0:
            teacher = teacher_by_id[teacher_id]
            teacher_shortfalls.append(
                TeacherShortfall(
                    teacherId=teacher_id,
                    teacherName=teacher.name,
                    target=teacher.targetPeriodsPerWeek,
                    scheduled=teacher.targetPeriodsPerWeek - shortfall_value,
                    shortfall=shortfall_value,
                )
            )

    return SolveResponse(
        solved=solved,
        assignments=assignments,
        classSubjectShortfalls=class_subject_shortfalls,
        teacherShortfalls=teacher_shortfalls,
        stats=SolveStats(
            variableCount=len(x),
            solveTimeMs=int((time.monotonic() - start) * 1000),
            solverStatus=final_status_name,
            tierWindowViolations=tier_violation_count,
        ),
    )
