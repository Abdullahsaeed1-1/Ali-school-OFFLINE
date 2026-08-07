# Ali Public School — Flutter Teacher App
## Brain file for Claude Code (MobileApp/)

## What this app is
A premium Flutter mobile app for **teachers** of Ali Public School. Teachers log in with their school email (set up by Admin via WebAdmin), and see their personal timetable, today's classes, profile, and get push notifications before each class. This is a professional tool teachers will use every working day — it must feel fast, polished, and trustworthy.

Future phases (NOT part of current build): student portal, parent portal, syllabus downloads.

## Who uses this app
**Only teachers.** Role = `TEACHER` in the backend. Admin does NOT use this app — admin uses WebAdmin (separate React web portal). Students/Parents = future phase.

## Backend connection
- Backend: Node.js + Express + Prisma + PostgreSQL (already live)
- Base URL: stored in `.env` file as `API_BASE_URL`
- Auth: JWT tokens returned in **response body** (not cookies — cookies are for WebAdmin browser only). Store tokens in `flutter_secure_storage` (NOT SharedPreferences — that's unencrypted).
- Access token: 30 min expiry. Refresh token: 7 days. Auto-refresh when 401 received.

## Brand tokens — use EXACTLY these
```
Background:        #080C14   (near-black, cool undertone)
Surface:           #0E1420   (dark navy surface)
Card:              #131C2E   (card background)
Primary Blue:      #143782   (school's dark blue — main brand color)
Accent Green:      #B4DC78   (school's light green — used very sparingly, max 2 uses per screen)
Maroon:            #7B1F2E   (shield border — used for alerts, warnings, destructive actions only)
White:             #FFFFFF
Text Primary:      #F0F4FF   (near-white, cool tone)
Text Muted:        #5A6A8A   (secondary text, labels)
Border:            #1A2540   (dividers, card borders)
Current Period:    #143782 with #B4DC78 left border glow (active class indicator)
```

## Typography
- Display/Headings: `Playfair Display` (Google Fonts) — used ONLY for teacher name on profile and today's greeting. Restraint.
- Body + UI: `Inter` (Google Fonts) — everything else.
- Never mix more than these two families anywhere.

## Design signature (the one memorable thing)
**The "Now" indicator** — when a class is currently happening, its card has a living left border: a vertical gradient bar from `#143782` to `#B4DC78` (blue to green, like the school torch flame). Subtle pulse animation (opacity 0.7 → 1.0, 2s loop). Everything else on the same screen is quieter so this one element draws the eye. This is the single design risk taken — everything else is disciplined and clean.

## Animation rules
- Page transitions: shared-axis slide (Material 3 style), 280ms
- Cards enter: fade + 12px upward translate, staggered 60ms per card
- The "Now" pulse: slow, 2s loop, subtle — not distracting
- Bottom nav indicator: smooth sliding pill, 200ms
- Loading states: shimmer skeleton (never a spinner in the middle of a content area)
- No bouncy springs. No rotation effects. No particle effects.

## Folder structure
```
MobileApp/
  lib/
    core/
      constants/
        app_colors.dart       all brand tokens as const Color
        app_text_styles.dart  typography scale
        app_spacing.dart      padding/margin constants
      network/
        api_client.dart       Dio instance, interceptors, auto-refresh
        api_endpoints.dart    all endpoint strings as constants
      storage/
        secure_storage.dart   flutter_secure_storage wrapper
      utils/
        date_utils.dart
    features/
      auth/
        data/
          auth_repository.dart
        presentation/
          login_screen.dart
          splash_screen.dart
      home/
        data/
          timetable_repository.dart
        presentation/
          home_screen.dart          today's classes
          timetable_screen.dart     full weekly grid
          profile_screen.dart
      notifications/
        notification_service.dart   FCM setup + local notification scheduling
    shared/
      widgets/
        period_card.dart        reusable class period card
        subject_badge.dart      colored subject pill
        shimmer_loader.dart
        app_bottom_nav.dart
    main.dart
  pubspec.yaml
  .env                          API_BASE_URL, etc (gitignored)
  CLAUDE.md                     this file
  PLAN.md                       full implementation plan
```

## State management
Use **Riverpod** (flutter_riverpod). Not Provider, not Bloc, not GetX. Riverpod only.

## Key packages (add to pubspec.yaml)
```yaml
dependencies:
  flutter_riverpod: ^2.x
  dio: ^5.x                        HTTP client
  flutter_secure_storage: ^9.x     encrypted token storage
  firebase_core: ^3.x              push notifications
  firebase_messaging: ^15.x        FCM
  flutter_local_notifications: ^17.x  show notification while app is open
  google_fonts: ^6.x               Inter + Playfair Display
  intl: ^0.19.x                    date formatting
  shimmer: ^3.x                    loading skeleton
  go_router: ^14.x                 navigation
  envied: ^0.5.x                   .env reading (compile-time safe)
```

## Non-negotiable security rules (from project security baseline)
- Tokens ONLY in flutter_secure_storage — never in SharedPreferences
- Never log tokens or API responses containing personal data in release builds
- Auto-refresh on 401 — if refresh also fails, clear storage + redirect to login
- HTTPS only for all API calls (enforce in Dio base options)

## Backend endpoints this app uses
```
POST   /api/auth/login              → { accessToken, refreshToken, user }
POST   /api/auth/refresh            → { accessToken }
POST   /api/auth/logout
GET    /api/auth/me                 → { id, email, role, teacherId }
GET    /api/timetable/teacher/:id?academicYear=2025-2026
POST   /api/notifications/register  → { fcmToken }  (backend saves FCM token)
```

## Backend changes needed (before Flutter can work)
1. `/api/auth/login` must return tokens in **response body** (not just cookies). WebAdmin uses cookies, Flutter uses body — both from the same endpoint, same request, backend sends both simultaneously.
2. New endpoint: `POST /api/notifications/register` — saves teacher's FCM token to DB so backend can send push notifications when timetable is published.
3. New field on `Teacher` model (or separate table): `fcmToken String?` — stores the device's Firebase token.

## What this app is NOT
- Not an admin tool (no adding teachers, no generating timetable)
- Not a student app (future phase)
- Not a web app (Flutter mobile only — Android + iOS)

## Future phases (don't build now, don't block for)
- Student login + their own timetable view
- Parent portal
- Syllabus/book downloads
- Attendance marking
