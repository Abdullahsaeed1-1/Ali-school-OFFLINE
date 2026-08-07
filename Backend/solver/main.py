from fastapi import FastAPI

from schemas import DutySolveRequest, DutySolveResponse, SolveRequest, SolveResponse
from solve import solve
from duty_solve import solve_duty

app = FastAPI(title="APS Timetable Solver")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
def solve_endpoint(request: SolveRequest) -> SolveResponse:
    return solve(request)


@app.post("/solve-duty", response_model=DutySolveResponse)
def solve_duty_endpoint(request: DutySolveRequest) -> DutySolveResponse:
    return solve_duty(request)
