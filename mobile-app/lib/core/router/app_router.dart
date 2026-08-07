import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/home/presentation/profile_screen.dart';
import '../../features/home/presentation/timetable_screen.dart';
import '../network/api_client.dart';
import 'app_shell.dart';

/// Bridges the network layer's [authFailureController] stream (fired when a
/// 401 refresh attempt fails — see core/network/api_client.dart) into a
/// go_router redirect, so an expired session bounces to /login from
/// wherever the user happens to be in the app.
class _AuthFailureListenable extends ChangeNotifier {
  _AuthFailureListenable() {
    _subscription = authFailureController.stream.listen((_) {
      pendingRedirect = true;
      notifyListeners();
    });
  }

  late final StreamSubscription<void> _subscription;
  bool pendingRedirect = false;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

final _authFailureListenable = _AuthFailureListenable();

final appRouter = GoRouter(
  initialLocation: '/splash',
  refreshListenable: _authFailureListenable,
  redirect: (context, state) {
    if (_authFailureListenable.pendingRedirect) {
      _authFailureListenable.pendingRedirect = false;
      if (state.matchedLocation != '/login') return '/login?reason=expired';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
    GoRoute(
      path: '/login',
      builder: (context, state) => LoginScreen(
        sessionExpired: state.uri.queryParameters['reason'] == 'expired',
      ),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/home', builder: (context, state) => const HomeScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/timetable', builder: (context, state) => const TimetableScreen())],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen())],
        ),
      ],
    ),
  ],
);
