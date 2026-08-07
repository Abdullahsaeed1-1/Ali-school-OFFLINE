"""
Games duty teacher-to-slot assignment (§17 Phase 2) — a maximum-coverage
CP-SAT model, replacing what used to be a greedy chronological first-fit in
gamesDutyScheduler.ts. That greedy version could "waste" a scarce
duty-eligible teacher on an early slot that had several other options,
leaving a later slot — with fewer options left — understaffed even when a
different assignment would have covered everyone. Confirmed against real
data (2026-07-27): the greedy pass left 8 of 44 needed duty-slots
uncovered on Girls campus even though a feasible assignment covering all 25
existed given the exact same teacher capacities and busy-slots.

Hard constraints (never softened):
  1. A teacher already busy (academic assignment) at that exact (day,
     period) can't also be on duty then — a physical impossibility.
  2. A teacher can never be assigned more duty periods than their
     remaining capacity (target minus real academic load) — the ceiling
     fix from item 13 stays fully intact; this model can only ever move
     WHICH slots get covered, never let anyone over their target.
  3. A group can never get more teachers than it needs (no overstaffing).

Objective: maximize total coverage first (by a wide margin), then — among
equally-good solutions — prefer spreading duty evenly rather than piling it
onto a few teachers, by minimizing the busiest teacher's total load. This
replaces the old "least-loaded-so-far" and "avoid yesterday's pair"
heuristics, which were sequential, greedy proxies for fairness; minimizing
the max load is the natural single-shot equivalent once every slot is
decided simultaneously rather than one at a time.
"""
from ortools.sat.python import cp_model

from schemas import DutyAssignment, DutySolveRequest, DutySolveResponse

COVERAGE_WEIGHT = 1_000
FAIRNESS_WEIGHT = 1


def solve_duty(request: DutySolveRequest) -> DutySolveResponse:
    model = cp_model.CpModel()

    x: dict[tuple[int, int], cp_model.IntVar] = {}
    for ti, teacher in enumerate(request.teachers):
        busy = set(teacher.busySlots)
        for gi, group in enumerate(request.groups):
            slot_key = f"{group.day}:{group.periodId}"
            if slot_key in busy:
                continue
            x[(ti, gi)] = model.NewBoolVar(f"x_{ti}_{gi}")

    covered_vars: list[cp_model.IntVar] = []
    for gi, group in enumerate(request.groups):
        vars_for_group = [x[(ti, gi)] for ti in range(len(request.teachers)) if (ti, gi) in x]
        covered = model.NewIntVar(0, group.teachersNeeded, f"covered_{gi}")
        model.Add(covered == sum(vars_for_group))
        covered_vars.append(covered)

    teacher_loads: list[cp_model.IntVar] = []
    for ti, teacher in enumerate(request.teachers):
        vars_for_teacher = [x[(ti, gi)] for gi in range(len(request.groups)) if (ti, gi) in x]
        load = model.NewIntVar(0, teacher.capacity, f"load_{ti}")
        model.Add(load == sum(vars_for_teacher))
        teacher_loads.append(load)

    max_load = model.NewIntVar(0, len(request.groups) * 2, "max_load")
    if teacher_loads:
        model.AddMaxEquality(max_load, teacher_loads)

    model.Maximize(sum(covered_vars) * COVERAGE_WEIGHT - max_load * FAIRNESS_WEIGHT)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    solved = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    assignments: list[DutyAssignment] = []
    total_covered = 0
    if solved:
        for gi, group in enumerate(request.groups):
            teacher_ids = [
                request.teachers[ti].id
                for ti in range(len(request.teachers))
                if (ti, gi) in x and solver.Value(x[(ti, gi)]) == 1
            ]
            assignments.append(DutyAssignment(day=group.day, periodId=group.periodId, teacherIds=teacher_ids))
            total_covered += len(teacher_ids)

    total_needed = sum(group.teachersNeeded for group in request.groups)
    return DutySolveResponse(solved=solved, assignments=assignments, totalNeeded=total_needed, totalCovered=total_covered)
