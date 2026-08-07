# Flutter Teacher App — Implementation Plan

## Overview
Complete Flutter app for Ali Public School teachers. Teachers log in → see today's classes → check full weekly timetable → get push notifications before class. Premium dark UI using school brand colors.

## Phase 0 — Backend updates (do this first, before any Flutter code)

### 0.1 Update `/api/auth/login` response
Currently returns tokens only as httpOnly cookies (for WebAdmin).
Add tokens to response **body** as well — both should happen simultaneously:
```json
{
  "user": { "id", "email", "role", "teacherId" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```
WebAdmin still uses cookies (unchanged). Flutter reads body. Same endpoint, same request.

### 0.2 Add FCM token storage
Add `fcmToken String?` field to `Teacher` model in schema.prisma.
Run migration: `prisma migrate dev --name add_teacher_fcm_token`

### 0.3 New endpoint: `POST /api/notifications/register`
Auth required (TEACHER role).
Body: `{ fcmToken: string }`
Action: update `Teacher.fcmToken` for the logged-in teacher's teacherId.
Response: `{ success: true }`

---

## Phase 1 — Flutter project setup

### 1.1 pubspec.yaml
Add all packages listed in CLAUDE.md. Run `flutter pub get`.

### 1.2 Firebase setup
- Create Firebase project: "ali-public-school-app"
- Add Android app (package: `com.alipublicschool.app`)
- Add iOS app (bundle ID: `com.alipublicschool.app`)
- Download `google-services.json` → `android/app/`
- Download `GoogleService-Info.plist` → `ios/Runner/`
- Enable FCM in Firebase console

### 1.3 Core constants
`lib/core/constants/app_colors.dart` — all brand tokens as `static const Color`
`lib/core/constants/app_text_styles.dart` — Inter + Playfair Display scale
`lib/core/constants/app_spacing.dart` — padding/margin as named doubles

### 1.4 API client (Dio)
`lib/core/network/api_client.dart`:
- Base URL from envied `.env`
- Default headers: `Content-Type: application/json`
- Interceptor: on 401, try `POST /auth/refresh` with stored refreshToken once, update stored accessToken, retry original. If refresh fails: clear secure storage → navigate to login.
- Request interceptor: read accessToken from secure_storage, attach as `Authorization: Bearer <token>`

---

## Phase 2 — Auth feature

### Splash Screen (`lib/features/auth/presentation/splash_screen.dart`)
- Full screen, school shield logo centered, background `#080C14`
- On init: check secure_storage for existing accessToken
- If exists: call `GET /api/auth/me` to validate
  - Valid → navigate to HomeScreen (replace)
  - Invalid → clear storage → navigate to LoginScreen (replace)
- If no token: navigate to LoginScreen
- Show logo for minimum 1.2s (even if check is faster) — feels intentional, not like a flash

### Login Screen (`lib/features/auth/presentation/login_screen.dart`)
**Layout:**
- Background: `#080C14`
- Top 35%: school shield logo + "ALI PUBLIC SCHOOL" in Inter SemiBold, white, letter-spacing 3px + "Teacher Portal" in muted text below
- Bottom 65%: card (`#0E1420`, rounded top corners 28px, no bottom corners — bleeds to bottom edge)
- Inside card: Email field + Password field (with show/hide toggle) + "Sign in" button

**Button:** full-width, `#143782` background, white text, 14px radius. Loading state: white spinner inside button, disabled.

**Error:** small red (`#7B1F2E`) text below button, appears only on failed login. Generic: "Incorrect email or password."

**Animation on enter:**
- Logo: fade in, 400ms
- Card: slide up from 40px below, 500ms ease-out, 150ms delay after logo
- Fields: fade in sequentially, 80ms stagger, after card

**On success:** save `accessToken` + `refreshToken` to secure_storage, save `teacherId` + `email`. Navigate to HomeScreen (replace — no back button to login).

---

## Phase 3 — Home Screen (Today's Classes)

`lib/features/home/presentation/home_screen.dart`

**This is the main screen — the one teachers open every morning.**

**Top section:**
- Greeting: "Good morning," in Inter Regular muted, then teacher's name in Playfair Display Medium white — this is the only place Playfair Display is used
- Today's date: "Monday, 7 July" — muted, small
- Small avatar circle (initials from name) top-right

**"Now" section (if a class is currently happening):**
- Prominent card, slightly larger than others
- Left border: vertical gradient `#143782` → `#B4DC78` (4px wide)
- Pulsing glow animation on left border (opacity 0.7 → 1.0, 2s loop)
- "NOW" label in `#B4DC78` — small, uppercase, 1px letter-spacing
- Subject name large, white
- Class name + Room (if available) below
- End time: "Until 09:40"

**Today's schedule list:**
- Each period = one card (`#131C2E`, 12px radius)
- Past periods: muted (60% opacity), no animation
- Current period: the "Now" card above (separate)
- Upcoming periods: full opacity, staggered fade+slide entrance
- Card content: Period number (small, muted) | Time | Subject | Class
- If no class in a period (free period): "Free period" in muted text, card slightly dimmer

**Empty state (no timetable generated yet):** centered, school icon, "Your timetable hasn't been set up yet. Contact your school administrator." — never a dead gray box.

**Pull to refresh:** standard Flutter RefreshIndicator, `#143782` color.

---

## Phase 4 — Weekly Timetable Screen

`lib/features/home/presentation/timetable_screen.dart`

**Navigation:** second tab in bottom nav (Calendar icon)

**Day selector:** horizontal scrollable row of day pills (Mon Tue Wed Thu Fri). Selected = `#143782` bg, white text. Today = underline dot in `#B4DC78`. Smooth animated sliding indicator.

**Period list for selected day:** same card design as Home screen but full day visible. Tap a card → small bottom sheet showing full details (subject, teacher if multiple, class, time, campus).

**Week at a glance toggle:** optional — a 5-column mini grid view (compact, shows just subject abbreviation per cell). Toggle between list and grid with animated crossfade.

---

## Phase 5 — Profile Screen

`lib/features/home/presentation/profile_screen.dart`

**Third tab in bottom nav (Person icon)**

**Layout:**
- Top: large avatar circle (initials, `#143782` bg) + name (Playfair Display, one of only two uses) + email (muted)
- Campus badge: same colored pills as WebAdmin (Junior/Girls/Boys)
- Stats row: 3 cards — Subjects | Classes | Periods/Week
- Subjects list: pills for each subject they teach
- "This Week" summary: total periods assigned this week vs target (simple bar, `#143782` fill, `#1A2540` track)

**Bottom:** Logout button (ghost, `#7B1F2E` border + text — maroon used here as destructive action).
Confirm dialog before logout: "Sign out of Teacher Portal?"

---

## Phase 6 — Bottom Navigation

`lib/shared/widgets/app_bottom_nav.dart`

3 tabs: Home (House icon) | Timetable (Calendar icon) | Profile (Person icon)

- Background: `#0E1420`
- Top border: `#1A2540` (1px)
- Active icon + label: `#143782` (school blue)
- Inactive: `#5A6A8A` (muted)
- Animated sliding pill indicator behind active item: `#143782` at 15% opacity, 200ms smooth slide
- No elevation shadow — flat, clean

---

## Phase 7 — Push Notifications

`lib/features/notifications/notification_service.dart`

### Setup
- Initialize Firebase + FCM on app start
- Request notification permission (iOS: explicit prompt, Android 13+: explicit prompt)
- Get FCM token → immediately call `POST /api/notifications/register` with token
- Refresh FCM token if it changes (FCM token can change) → re-register

### Notification types
**Class reminder (10 minutes before):**
- Title: "Class in 10 minutes"
- Body: "Maths — Class 8A at 09:00"
- Tapping notification → opens app to today's Home screen

**Timetable published (admin generates new timetable):**
- Title: "Your timetable has been updated"
- Body: "A new schedule is ready for 2025-2026"
- Tapping → opens Timetable screen

### Backend sends notifications
When admin generates timetable (via WebAdmin), backend:
1. Fetches all Teachers with non-null `fcmToken`
2. Sends FCM notification to each teacher's token via Firebase Admin SDK
3. For daily reminders: a scheduled job (node-cron) runs every morning, checks today's first period for each teacher, schedules a local notification at (startTime - 10 minutes)

### While app is open
Use `flutter_local_notifications` to show notification banner when FCM message arrives while app is in foreground (FCM doesn't auto-show when app is open).

---

## Phase 8 — Final polish

- App icon: use school shield/crest (provide image file → `flutter_launcher_icons` package)
- Splash screen: native splash using `flutter_native_splash` package
- Handle no-internet gracefully: show cached data if available, banner "No connection — showing last synced data"
- Handle expired session: if 401 and refresh fails, show "Your session expired. Please sign in again." — don't just silently redirect
- Release build: disable all debug logs (`kDebugMode` checks everywhere)

---

## Build order for Claude Code
1. Phase 0 (Backend changes) — do this first
2. Phase 1 (Setup + constants)
3. Phase 2 (Auth: Splash + Login)
4. Phase 3 (Home screen)
5. Phase 6 (Bottom nav — needed for Phase 4+5)
6. Phase 4 (Timetable screen)
7. Phase 5 (Profile screen)
8. Phase 7 (Push notifications — last, needs Firebase configured)
9. Phase 8 (Polish)

## Teacher email setup flow (how admin gives teachers access)
1. Admin opens WebAdmin → Teachers page → Add Teacher
2. Fills teacher name, email, campus, subjects
3. Admin separately tells teacher: "Your login is [email], your password is [whatever admin set]"
   (For now: admin sets a temporary password via WebAdmin when creating teacher. Future: email invite system)
4. Teacher downloads app → enters email + password → logged in
