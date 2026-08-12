# Ali Public School — App Features Report

A snapshot of what the offline desktop app actually does, as of this
build. For the technical conversion history (how it got here), see
`docs/offline-conversion-plan.md`.

## What this is

A Windows desktop app for Ali Public School (Junior, Girls, Boys
campuses) that replaces their Excel-based timetable process. One
computer runs the app; any other staff device on the same school network
can use it too, from a normal web browser — nothing else needs
installing on those.

- **Distribution**: a single `.exe` installer (Electron), no internet
  required to run once installed.
- **Data**: stored locally on whichever machine runs the app (SQLite) —
  not in the cloud, not synced anywhere automatically.
- **Access**: the admin's own computer opens the app in its own window;
  any other device on the LAN opens `http://<that-computer's-IP>:3000`
  in a regular browser and gets the same app.

## First-time setup

On the very first launch, the app automatically:
- Creates its database and loads the school's real, confirmed
  curriculum (all 3 campuses' classes, teachers, and subjects).
- Generates a one-time admin login (random password) and displays it on
  screen — no manual setup, no terminal.
- From then on, every subsequent launch skips this and opens straight
  into the app with whatever data is actually on that machine.

## Core features

**Accounts & access**
- Admin login (email + password), session stays active until logout.
- Change password from Settings.
- Multiple staff can have their own accounts on the same computer,
  independently logged in/out, without affecting each other.

**Curriculum management (CRUD)**
- Teachers: add/edit, contact info, campus assignment, weekly
  period targets, subject/class eligibility, active/on-leave/inactive
  status, hired vs. to-be-hired.
- Classes: add/edit, grade/section, per-subject weekly period quotas,
  Games-period protection settings.
- Subjects: add/edit, core vs. elective, scheduling tier (early-day vs.
  late-day preference).

**Auto-Generate Timetable**
- One click generates a full, conflict-free weekly timetable for a
  campus (or all three at once) — no teacher double-booked, no class
  double-booked, respects each class's required periods per subject.
- Reports exactly what it couldn't fully satisfy (a class short on a
  subject, a teacher under target) instead of silently guessing.
- Games periods handled by a separate duty-rotation pass (2 teachers
  covering the shared ground per period, not per class).

**Manual control over the schedule**
- Lock a whole class so Generate never touches it again.
- Lock a single period, or a teacher's whole day, so Generate works
  around that one committed slot/day while regenerating everything else
  freely.
- Manually edit/clear individual timetable slots outside of Generate.
- Per-teacher printable weekly schedule and an on-screen weekly grid
  view.

**Guidance & dashboards**
- Dashboard: at-a-glance counts (teachers/classes/subjects), per-campus
  breakdown, recent activity.
- Warnings: data-completeness issues (to-be-hired gaps, missing
  eligibility, etc.) in plain language.
- Capacity Advisor: for teachers under their weekly target, suggests
  safe reassignments from real uncovered curriculum need — never
  invents a new subject for someone.
- Gaps & Suggestions: the same shortfall/reassignment data, browsable
  by class or by teacher.
- Guidelines page: built-in plain-language explanation of how
  Generate/Lock/Warnings/Capacity Advisor actually behave.

**Data safety**
- Settings → Download Backup: one click saves a complete, self-contained
  copy of the school's current database to the Downloads folder. Since
  this app has no automatic cloud backup, this is the school's (and
  Abdullah's) way to keep a safe copy, or to hand over real data for
  testing a future update against.

**Mobile app account linking (admin-side only)**
- Admin can set/reset a teacher's mobile-app login password from their
  profile. (The Flutter teacher mobile app itself is a separate,
  not-yet-built project — see root `CLAUDE.md`.)

## Known limitations (as of this build)

- **Unsigned installer** — Windows will show a "Windows protected your
  PC" warning on first run on any machine (expected; click "More info" →
  "Run anyway"). Deliberately deferred until the app is finalized —
  code signing costs money and the app is still being iterated on.
- **No automatic backups or cloud sync** — the Download Backup button
  (above) is the only backup mechanism right now; nothing runs on a
  schedule.
- **No auto-update** — a future app update means Abdullah rebuilding the
  installer and the school running it again on their machine. Their
  existing data is untouched by this (confirmed by direct testing —
  install/uninstall/reinstall all leave the database alone).
- **LAN traffic is plain HTTP**, not encrypted — acceptable for a
  private school network, not meant for use over the open internet.
- **Push notifications**: a teacher's mobile device can register itself
  with the backend (`fcmToken`), but nothing currently sends a
  notification to it — the sending side isn't built yet.
- **Mobile app, Student/Parent portal**: not built yet — out of scope
  for this offline conversion.
- **No custom installer branding** beyond the app icon (default NSIS
  installer look) — cosmetic, not blocking.

## Where things actually live (technical reference)

- Database: `%APPDATA%\ali-school-desktop\data\app.db` (per machine).
- First-run config / admin password record:
  `%APPDATA%\ali-school-desktop\config.json`.
- Startup error log (if something ever fails to launch):
  `%APPDATA%\ali-school-desktop\startup-error.log`.
- Installed program files:
  `%LOCALAPPDATA%\Programs\ali-school-desktop\`.
