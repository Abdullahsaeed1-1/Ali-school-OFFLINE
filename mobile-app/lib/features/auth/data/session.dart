import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/secure_storage.dart';

/// The logged-in teacher's id, read from secure storage. By the time any
/// screen that depends on this is reachable, the auth flow has already
/// guaranteed a valid session exists (splash/login only navigate onward
/// after a successful login or a validated /auth/me check).
final currentTeacherIdProvider = FutureProvider<String?>((ref) => SecureStorage.getTeacherId());
