"""
Standalone entrypoint for the packaged (PyInstaller) solver executable.

main.py just defines the FastAPI app object — fine for `uvicorn main:app`
in dev, but a frozen exe has no `uvicorn` CLI to resolve that import
string against, so this calls uvicorn's programmatic API directly instead.
Electron spawns this exe as a child process (see
docs/offline-conversion-plan.md Phase 3/4); it reads SOLVER_PORT from the
environment so Electron can pick a free port if 8001 is ever taken.
"""
import os

import uvicorn

from main import app

if __name__ == "__main__":
    port = int(os.environ.get("SOLVER_PORT", "8001"))
    # 127.0.0.1 only — never expose the solver to the LAN, only the main
    # backend (which the LAN does reach) talks to it, over loopback.
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
