# GeoWork Pro — Backend (Phase 1: Modules 1–9, V1.0 MVP COMPLETE)

Django + DRF backend covering all nine V1.0 modules: **Authentication**,
**Company Management**, **Employee Management**, the **Interactive Geofence
Builder**, **Attendance**, **Live Employee Tracking**, the **Dashboard**,
**Reports**, and **Notifications** for the GeoWork Pro field workforce
platform. This is a multi-tenant system: every company's data is isolated
by a `company` FK, enforced in both querysets and permissions.

## What's implemented

### Module 1 — Authentication (`accounts` app)
- Custom `User` model (phone-based login, roles: ADMIN / MANAGER / EMPLOYEE)
- Password login — `POST /api/v1/auth/login/`
- OTP login — `POST /api/v1/auth/login/otp/request/` → `POST /api/v1/auth/login/otp/verify/`
- Forgot password — `POST /api/v1/auth/password/forgot/` → `POST /api/v1/auth/password/reset/`
- JWT access/refresh via SimpleJWT, with blacklist-on-logout
- Device registration for push notifications — `POST /api/v1/auth/device/`
- `GET/PATCH /api/v1/auth/me/` — current user profile

### Module 2 — Company Management (`companies` app)
- `Company`, `Branch`, `Department`, `Designation`, `ShiftTiming`, `WorkingDay` models
- Full CRUD via DRF routers at `/api/v1/company/...`
- Read access for any authenticated tenant user; write access restricted to ADMIN
- `Company` itself: platform superusers manage all tenants; a tenant admin can
  only view/update their own company (no cross-tenant listing)

### Module 3 — Employee Management (`employees` app)
- `Employee` profile model (1:1 with `User`), linked to branch/department/designation/shift/manager
- **Add Employee** creates the login `User` + `Employee` profile in one call — `POST /api/v1/employees/`
- Edit — `PATCH /api/v1/employees/{id}/`
- **Disable/Enable** (soft, preserves history) — `POST /api/v1/employees/{id}/status/` with `{"action": "disable"}`
- Hard delete is intentionally blocked (405) to protect attendance/job history
- Manager/Admin-only writes; any tenant user can read (needed for org lookups, manager pickers, etc.)

All list/detail endpoints are automatically scoped to `request.user.company`
(see `accounts/permissions.py::company_scoped_queryset`); superusers bypass
this for platform administration.

### Module 4 — Interactive Geofence Builder (`geofence` app)
- Built on **GeoDjango + PostGIS** — real spatial geometry and indexed
  containment queries (`boundary__contains=point`), not manual math, so it
  stays fast as work areas and employees scale into the thousands.
- `WorkArea` model supports three admin-drawable shapes, all normalized to a
  `Polygon` for uniform querying:
  - **Polygon** — send `points`: an ordered list of `{latitude, longitude}` vertices (min 3)
  - **Rectangle** — send `bounds`: `{south_west: {...}, north_east: {...}}`
  - **Circle** — send `center: {latitude, longitude}` + `radius_meters`; the exact
    center/radius are preserved separately (`center_out`, `radius_meters`) so the
    map editor can redraw a true circle instead of the polygon approximation
    used internally for containment math
- `name`, `color` (hex), `category` (Factory / Warehouse / Office / Parking /
  Assembly Line / Battery Room / Dispatch Area / Customer Site / Other) — matches
  the example work areas from the spec
- **`POST /api/v1/geofence/work-areas/check-point/`** — given a lat/lng (+ optional
  branch), returns every active work area containing that point. This is the
  exact query Module 5 (Attendance) and Module 6 (Live Tracking) will call.
- Full CRUD at `/api/v1/geofence/work-areas/` — read for any tenant user
  (mobile app needs "which zone am I in"), write for admins only
- **Audit log** (`WorkAreaAuditLog`) — every create/update/delete is recorded
  with who/when/a geometry snapshot, since geofence edits directly affect
  attendance and payroll outcomes
- Django Admin gets a live map widget (`GISModelAdmin`) for eyeballing/editing
  boundaries without the mobile app

### Module 5 — Attendance (`attendance` app)
- One `AttendanceRecord` per employee per calendar day, with the employee's
  `shift` snapshotted at check-in time (so a later shift reassignment
  doesn't retroactively change past late/half-day math).
- **`POST /api/v1/attendance/start-shift/`** — manual Start Shift. Requires
  the employee's lat/lng to fall inside an active `WorkArea` for their
  branch (reuses Module 4's `contains_point()`); rejects with a clear 400
  otherwise. Idempotent — a second call the same day returns the existing
  check-in rather than overwriting it.
- **`POST /api/v1/attendance/end-shift/`** — manual End Shift. Computes
  `working_minutes`, flags `is_early_exit` against `shift.end_time`, and
  sets `status` to `HALF_DAY` or `PRESENT` based on the shift's
  `half_day_after_minutes` threshold.
- **`POST /api/v1/attendance/geofence-event/`** — Auto Check-In / Auto
  Check-Out. Takes `{event_type: "ENTER"|"EXIT", latitude, longitude}` and
  is the entry point Module 6 (live tracking)/the mobile app's background
  geofence listener will call — it drives the exact same `start_shift`/
  `end_shift` logic as the manual buttons, just with `source=AUTO_GEOFENCE`
  recorded for later reporting.
- **`GET /api/v1/attendance/today/`** — the current user's own record for today.
- **`GET /api/v1/attendance/records/`** — history/reporting list. Employees
  see only their own records; managers/admins see the whole company.
- **Late Arrival** — computed against `shift.start_time + grace_period_minutes`.
- **Absent marking** — `python manage.py mark_absentees [--date YYYY-MM-DD]`
  (also exposed as a Celery task, `attendance.tasks.mark_absentees_task`, for
  a daily beat schedule) creates an `ABSENT` record for any active employee
  with no attendance record on the given date. Safe to re-run — never double-marks.

> **V1.1 fix (previously a documented limitation):** early-exit/overtime
> calculations now correctly handle night shifts (`is_night_shift=True`,
> where `end_time` falls on the next calendar day) by anchoring the
> scheduled end time to the correct calendar day instead of always using
> the check-out's own date. See `attendance.services._early_exit_minutes`.

### Module 6 — Live Employee Tracking (`tracking` app)
- **`POST /api/v1/tracking/ping/`** — the mobile app calls this periodically
  while a shift is active (lat/lng, GPS accuracy, battery level, GPS-enabled
  and network-connected flags). Every ping:
  1. Runs Module 4's `contains_point()` to find the current work area (reusing
     the same shared `geofence.services.find_containing_work_area()` that
     Attendance uses — the two modules can never disagree on containment rules).
  2. Records a `LocationPing` (append-only history/audit trail).
  3. Upserts `EmployeeLiveStatus` — one denormalized row per employee, so the
     dashboard never has to scan ping history.
  4. **Automatically fires Module 5's attendance check-in/check-out** whenever
     the employee's work-area membership changes — entering an area = ENTER
     event, leaving = EXIT event. This is the "Attendance should be based on
     employee entering or leaving approved geofence areas" requirement,
     fully wired: once the mobile app is sending pings, attendance tracks
     itself with zero extra taps from the employee.
- **`GET /api/v1/tracking/live/`** — the live dashboard feed. Manager/Admin
  only. Returns, per employee: current lat/lng, `is_online` (computed from
  ping recency, default 5-minute threshold via `LIVE_TRACKING_ONLINE_THRESHOLD_MINUTES`),
  `connectivity_status` (`ONLINE` / `OFFLINE` / `GPS_DISABLED` /
  `INTERNET_DISCONNECTED` — matching the spec's exact dashboard states),
  `current_work_area`, `last_ping_at`, and `shift_status` (`NOT_STARTED` /
  `WORKING` / `SHIFT_ENDED` / `ABSENT`, derived from today's attendance record).
- **`GET /api/v1/tracking/pings/`** — raw ping history, for an audit trail
  and as the raw material for V2's distance-travelled / site-visit reports.
  Employees see only their own history; managers/admins see the company's.

### Module 7 — Dashboard (`dashboard` app)
- **`GET /api/v1/dashboard/summary/`** — the single tile-row endpoint behind
  the admin dashboard's "Today's Employees / Present / Absent / Late /
  Working / Outside Work Area / GPS Disabled / Jobs" cards. Manager/Admin only.
- Deliberately has **no models of its own** — every number is a rollup query
  over Modules 3 (Employee), 5 (Attendance), and 6 (Tracking), so the
  dashboard can never drift out of sync with the data it's summarizing.
- Two time semantics, both explicit in the response:
  - `present` / `absent` / `half_day` / `late` are computed for a specific
    `?date=YYYY-MM-DD` (defaults to today) from `AttendanceRecord`.
  - `working` / `outside_work_area` / `gps_disabled` are always a **live**
    snapshot from `EmployeeLiveStatus` — there's no historical "who was
    online at 3pm last Tuesday," only current/last-known state.
- `outside_work_area` specifically means: currently checked in (working) but
  the last location ping didn't fall inside any active work area — i.e.
  someone who should be on-site but the live map says otherwise.
- `?branch=<id>` scopes every tile to one branch instead of the whole company.
- `jobs_completed` / `pending_jobs` are `null` with `jobs_module_available: false`
  — Job Management is a V2.0 feature (see roadmap) and doesn't exist yet, so
  these are honest placeholders rather than fabricated zeros.

### Module 8 — Reports (`reports` app)
- Six report types, all sharing one query pattern (RBAC-scoped exactly like
  Attendance/Dashboard: plain employees are always restricted to their own
  data regardless of what `?employee=` they pass) and one output pipeline:
  - `GET /api/v1/reports/daily-attendance/?date=YYYY-MM-DD`
  - `GET /api/v1/reports/monthly-attendance/?year=YYYY&month=M`
  - `GET /api/v1/reports/working-hours/?date_from=&date_to=`
  - `GET /api/v1/reports/late/?date_from=&date_to=`
  - `GET /api/v1/reports/overtime/?date_from=&date_to=` (minutes worked
    beyond the shift's `full_day_minutes`, 480min/8hr fallback if unassigned)
  - `GET /api/v1/reports/attendance-percentage/?date_from=&date_to=`
  - All six accept `?branch=<id>` and `?employee=<id>` (admin/manager only —
    silently ignored/overridden to "self" for a plain employee).
- **Export**: add `&export=excel` or `&export=pdf` to any of the above to
  download instead of getting JSON. **Deliberately not called `format`** —
  that's a reserved DRF content-negotiation query param, and using it
  causes a silent 404 before your view code even runs. Caught this exact
  bug during testing and fixed it — flagging it here since it's a very easy
  trap to fall back into if this pattern gets copied elsewhere.
- Excel export via `openpyxl` (styled header row, autosized columns); PDF
  via `reportlab` (landscape table, striped rows). Both verified by
  actually opening the generated files, not just checking byte counts.
- No models of its own — every number comes from `attendance.AttendanceRecord`,
  the same pattern as Module 7's Dashboard.

### Module 9 — Notifications (`notifications` app)
- One `Notification` row per event per recipient, covering every trigger
  the spec lists: shift start/end, geofence enter/exit, GPS disabled,
  internet disconnected, absent, late arrival.
- Push delivery is a **stubbed, swappable function**
  (`notifications.services.send_push_notification`) — logs instead of
  calling Firebase Cloud Messaging, so everything works out of the box
  without real FCM credentials (same pattern as Module 1's OTP-SMS stub).
  Wiring real FCM later means installing `firebase-admin` and replacing the
  body of that one function — every call site is already written against it.
- **Who gets notified, by design:**
  - Shift start/end and late arrival go to **both** the employee and their
    manager (`Employee.manager`) — the employee gets a confirmation, the
    manager gets oversight.
  - Geofence enter/exit, GPS disabled, and internet disconnected are
    **manager-only** — an employee doesn't need a push telling them they
    walked through their own gate or that their own phone's GPS is off.
  - Absent notifies both the employee and their manager.
- GPS-disabled/internet-disconnected notifications fire **only on a
  True→False transition** (compared against the employee's previous
  `EmployeeLiveStatus`), not on every subsequent ping while still off —
  otherwise a manager would get spammed every ping cycle for as long as an
  employee's connectivity stays down.
- **`GET /api/v1/notifications/`** — the current user's own inbox (never
  cross-user, even for admins — that's what each source module's own audit
  trail is for). `POST /{id}/read/`, `POST /mark-all-read/`,
  `GET /unread-count/` round out the inbox UX.
- Triggers are wired directly into the exact place each event happens:
  `attendance.services.start_shift`/`end_shift`, `attendance.tasks.mark_absentees_for_date`,
  and `tracking.services.process_ping` — so there's one readable place
  (`notifications/services.py`) listing every "when do we notify someone"
  rule, even though the triggers themselves live in three different apps.

## Project layout

```
geowork_backend/
├── geowork_backend/       # settings, root urls, wsgi
├── accounts/               # Module 1 — User, OTP, Device, JWT views, RBAC permissions
├── companies/               # Module 2 — Company, Branch, Department, Designation, ShiftTiming, WorkingDay
├── employees/                # Module 3 — Employee profile + admin-facing create/disable flows
├── geofence/                 # Module 4 — WorkArea (polygon/circle/rectangle) + point-in-boundary checks
├── attendance/                # Module 5 — Start/End Shift, auto geofence check-in/out, absentee marking
├── tracking/                 # Module 6 — Location pings, live dashboard, auto-fires attendance on work-area transitions
├── dashboard/                 # Module 7 — Summary tile rollup over Employee/Attendance/Tracking (no models of its own)
├── reports/                   # Module 8 — Daily/monthly attendance, working hours, late, overtime, attendance % — JSON/Excel/PDF
├── notifications/             # Module 9 — In-app inbox + stubbed push delivery, triggered from Attendance/Tracking events
├── requirements.txt
├── .env.example
└── manage.py
```

## Setup

```bash
# System libraries for GeoDjango (Module 4) — one-time, per machine:
sudo apt-get install gdal-bin libgdal-dev libgeos-dev libproj-dev

python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit DB credentials, SECRET_KEY, etc.

# requires a running PostgreSQL instance matching your .env, with PostGIS enabled:
#   psql -d geowork -c "CREATE EXTENSION IF NOT EXISTS postgis;"
python manage.py migrate
python manage.py createsuperuser --phone +910000000000
python manage.py runserver
```

> Note: models were validated end-to-end against SQLite/SpatiaLite during
> development (migrations apply cleanly, and the auth/RBAC/tenant-isolation/
> geofence flows were all smoke-tested via the live API). Point `.env` at
> your real PostGIS-enabled PostgreSQL instance for actual deployment — no
> code changes needed, just the `CREATE EXTENSION postgis;` above and valid
> `DB_*` env vars.

## Verified flows (smoke-tested)

- Password login → JWT → `/me/` ✅
- Tenant-scoped employee listing (admin sees only their company) ✅
- Admin-only employee creation (`EmployeeCreateSerializer` creates `User` + `Employee` atomically) ✅
- RBAC: employee role gets `403` on write endpoints, `200` on reads ✅
- OTP request → verify → JWT issuance ✅
- Company list scoping: tenant admin sees only their own company; superuser would see all ✅
- Disable flow deactivates both `Employee.status` and `User.is_active` together ✅
- Polygon, circle, and rectangle work-area creation, each correctly normalized to a stored `Polygon` ✅
- Point-in-boundary check correctly finds/excludes matches across shape types ✅
- Geofence read-for-all / write-for-admin-only RBAC ✅
- Every create/update/delete on a `WorkArea` writes a `WorkAreaAuditLog` entry ✅
- Malformed shape input (e.g. a 2-point "polygon") rejected with a clear 400 ✅
- Start-shift rejected (400) when the employee's point falls outside every active work area ✅
- Start-shift inside a geofence succeeds, correctly flags late arrival, and is idempotent on repeat calls ✅
- End-shift correctly computes `working_minutes` and resolves to `PRESENT` for a full day ✅
- Employees only ever see their own attendance history; managers/admins see the whole company ✅
- A geofence `ENTER` event auto-checks-in with `source=AUTO_GEOFENCE`; a quick `EXIT` after correctly resolves to `HALF_DAY` given the short duration ✅
- `mark_absentees` correctly catches an employee with zero attendance activity, and is a no-op on re-run ✅
- A ping outside any work area produces no attendance change; a ping crossing into one auto-checks-in with `source=AUTO_GEOFENCE`; a repeat ping in the same area doesn't double-fire; a ping crossing back out auto-checks-out ✅
- `connectivity_status` correctly reports `GPS_DISABLED` when the device flag is off, and `OFFLINE` once `last_ping_at` goes stale past the online threshold ✅
- Live dashboard is manager/admin-only (403 for a plain employee); ping history is self-scoped for employees and company-wide for managers/admins ✅
- Dashboard summary against a 5-employee scenario (1 on-time present, 1 late-and-currently-outside-area, 1 half-day, 1 absent, 1 GPS-disabled) returned every count exactly right: `present=3, absent=1, half_day=1, late=1, working=3, outside_work_area=1, gps_disabled=1` ✅
- Dashboard summary is manager/admin-only (403 for a plain employee); a malformed `?date=` param returns a clean 400 rather than a 500 ✅
- All six report types return correct JSON data against a real 9-hour-workday scenario, including correctly computing 60 minutes of overtime past an 8-hour shift ✅
- Report Excel exports were opened with `openpyxl` and confirmed to contain the correct title/header/data rows (not just checked for non-empty bytes); PDF exports were confirmed as genuinely valid single-page PDFs via file-type inspection ✅
- Caught and fixed a real bug during testing: using `?format=excel` collided with DRF's reserved `format` query param and silently 404'd — renamed to `?export=` and re-verified all six report types across JSON/Excel/PDF ✅
- Report RBAC: a plain employee always sees only their own row, even when explicitly passing a different `?employee=` id ✅
- All 8 notification triggers fire correctly and reach the right recipient(s): shift start (+ late arrival) and shift end reach both employee and manager; geofence enter/exit, GPS-disabled, and internet-disconnected reach only the manager; absent reaches both — verified against a real multi-employee scenario with registered devices, confirming `delivery_status=SENT` ✅
- GPS-disabled/internet-disconnected notifications correctly fire only once on the True→False transition, not on every subsequent ping while still off ✅
- Notification inbox read/unread flow (mark one read, mark all read, unread count) verified end-to-end ✅

## Post-V1.0 bugfix log

- **`rest_framework_simplejwt.token_blacklist` was missing from `INSTALLED_APPS`**
  (Module 1 gap, found and fixed while building the ops-console frontend).
  `SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"] = True` was set from the start, and
  `LogoutView` always called `token.blacklist()`, but without the blacklist
  app installed/migrated, both silently failed — logout returned a
  misleading `400 "Invalid or already-expired token."` instead of actually
  revoking the session. Caught by replaying the exact same request sequence
  the new frontend makes against a live server (see `geowork-console.html`).
  Fixed by adding the app to `INSTALLED_APPS`; running `migrate` now applies
  13 `token_blacklist` migrations. Re-verified: a normal login→logout now
  correctly returns `200 "Logged out."`, and refresh-token rotation
  correctly blacklists the old token.

## Design notes for the next modules

- `ShiftTiming` already carries `grace_period_minutes`, `half_day_after_minutes`,
  `full_day_minutes` — these feed directly into Module 5's working-hours calc.
- `Employee.manager` (self-FK) is in place for Module 3.5-ish reporting-chain
  needs and will also drive the Approval Workflow in V3.0.
- `WorkArea.contains_point()` and the `check-point` endpoint are the exact
  building blocks Module 5 (auto check-in/out) and Module 6 (live tracking,
  "current work area") will call — no new geometry code needed there, just
  wiring attendance/location events to this existing query.
- Module 4 currently supports flat (non-nested) work areas per the V1.0 spec.
  V3.0's Multi-Level Geofencing can add a nullable `parent` self-FK to
  `WorkArea` plus "smallest containing area wins" resolution logic on top of
  the same `boundary__contains` query — no breaking change to what's built now.

## Celery beat schedule (for absentee marking)

`mark_absentees_task` is a plain `@shared_task` (and now also fires
absent-notification pushes via Module 9 automatically). Wire it into a
daily schedule once Celery/Redis are running (e.g. in `settings.py` or
wherever your `CELERY_BEAT_SCHEDULE` lives):

```python
CELERY_BEAT_SCHEDULE = {
    "mark-absentees-daily": {
        "task": "attendance.tasks.mark_absentees_task",
        "schedule": crontab(hour=23, minute=0),  # after the latest shift's end_time
    },
}
```

Note: a `celery.py` app entrypoint isn't included yet — this project has
only been tested with the task function called directly / via the
management command. Adding the Celery app bootstrap (`app = Celery(...)`
+ `app.config_from_object(...)` in `geowork_backend/celery.py`, wired into
`geowork_backend/__init__.py`) is a small, standard addition needed before
`celery -A geowork_backend worker` will actually pick this up.

## V1.0 MVP backend: complete

All 9 modules from the original spec's V1.0 roadmap are built and verified:
Authentication, Company Management, Employee Management, Geofence Builder,
Attendance, Live Tracking, Dashboard, Reports, and Notifications.

**What's still outside this backend's scope, worth being clear about:**
- The **Flutter mobile app** and **Admin Web Portal** don't exist yet — this
  is API-only. Every module above has a "what the frontend needs to call"
  shape, but no UI has been built against it.
- **No company-onboarding endpoint** — creating a new tenant + first admin
  currently requires the Django shell (flagged back at Module 4, still open).
- **No automated test suite** — every module here was validated via one-off
  smoke-test scripts during development, not a `pytest` suite that runs on
  every future change.
- **No API documentation** (OpenAPI/Swagger/Postman collection).
- **Celery isn't fully wired** — see the note above.
- Real **FCM push delivery** isn't wired — see Module 9's stub note above.

## Not yet built (V2.0 / V3.0, per the original roadmap)

**V2.0 — Workforce Management:** Job Management + Customer Visit, Work
Checklist, Leave Management, Expense Management, Employee Documents,
Advanced Reports.

**V3.0 — Enterprise:** Multi-Level Geofencing, Visitor Management,
Contractor Management, Asset Management, Vehicle Tracking, Shift Planning,
Approval Workflow, Payroll Export, QR/NFC Attendance, Offline Mode + Sync.
