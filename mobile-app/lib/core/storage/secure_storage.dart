import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'web_storage_stub.dart' if (dart.library.html) 'web_storage_web.dart';

/// Thin wrapper around [FlutterSecureStorage]. Tokens and account identifiers
/// go here — NEVER in SharedPreferences (unencrypted on disk).
///
/// Web builds are dev/testing only here (the shipped app is Android/iOS —
/// see mobile-app/CLAUDE.md), and flutter_secure_storage's web backend can
/// throw a raw browser OperationError (SubtleCrypto) depending on the origin.
/// So on web we fall back to browser localStorage via [WebLocalStorage]
/// instead — not encrypted, but it survives a page reload, which a plain
/// in-memory map doesn't (and losing the session on every refresh made web
/// unusable for actually testing the app).
class SecureStorage {
  SecureStorage._();

  static const _storage = FlutterSecureStorage();

  static const _accessTokenKey = 'accessToken';
  static const _refreshTokenKey = 'refreshToken';
  static const _teacherIdKey = 'teacherId';
  static const _emailKey = 'email';

  static Future<void> _write(String key, String value) {
    if (kIsWeb) {
      WebLocalStorage.write(key, value);
      return Future.value();
    }
    return _storage.write(key: key, value: value);
  }

  static Future<String?> _read(String key) {
    if (kIsWeb) return Future.value(WebLocalStorage.read(key));
    return _storage.read(key: key);
  }

  static Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
    required String? teacherId,
    required String email,
  }) async {
    await Future.wait([
      _write(_accessTokenKey, accessToken),
      _write(_refreshTokenKey, refreshToken),
      if (teacherId != null) _write(_teacherIdKey, teacherId),
      _write(_emailKey, email),
    ]);
  }

  static Future<String?> getAccessToken() => _read(_accessTokenKey);
  static Future<String?> getRefreshToken() => _read(_refreshTokenKey);
  static Future<String?> getTeacherId() => _read(_teacherIdKey);
  static Future<String?> getEmail() => _read(_emailKey);

  static Future<void> setAccessToken(String accessToken) =>
      _write(_accessTokenKey, accessToken);

  /// Clears the whole session — call on logout or when refresh fails.
  static Future<void> clear() {
    if (kIsWeb) {
      WebLocalStorage.clear();
      return Future.value();
    }
    return _storage.deleteAll();
  }
}
