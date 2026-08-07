import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
import 'models/app_user.dart';

class AuthRepository {
  AuthRepository(this._dio);

  final Dio _dio;

  Future<AppUser> login({required String email, required String password}) async {
    final response = await withHardTimeout(
      _dio.post<Map<String, dynamic>>(ApiEndpoints.login, data: {'email': email, 'password': password}),
      path: ApiEndpoints.login,
    );

    final data = response.data!;
    final user = AppUser.fromJson(data['user'] as Map<String, dynamic>);

    await SecureStorage.saveSession(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
      teacherId: user.teacherId,
      email: user.email,
    );

    return user;
  }

  /// Validates the stored session. Throws if there's no session or the
  /// backend rejects it — callers should treat any error as "not logged in".
  Future<AppUser> fetchMe() async {
    final response = await withHardTimeout(_dio.get<Map<String, dynamic>>(ApiEndpoints.me), path: ApiEndpoints.me);
    return AppUser.fromJson(response.data!['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    final refreshToken = await SecureStorage.getRefreshToken();
    try {
      await _dio.post(ApiEndpoints.logout, data: {'refreshToken': refreshToken});
    } catch (_) {
      // Best-effort — the local session is cleared regardless of the network result.
    }
    await SecureStorage.clear();
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);
