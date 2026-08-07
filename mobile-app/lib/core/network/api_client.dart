import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/env.dart';
import '../storage/secure_storage.dart';
import 'api_endpoints.dart';

/// Fires whenever a request fails auth and the refresh attempt also failed
/// (refresh token missing/expired/rejected). Storage has already been
/// cleared by the time this fires. The auth feature (Phase 2) listens to
/// this to redirect to the login screen — the network layer itself never
/// navigates.
final authFailureController = StreamController<void>.broadcast();

/// Builds the shared [Dio] instance used for all backend calls.
///
/// - Attaches `Authorization: Bearer <accessToken>` from secure storage.
/// - On a 401, attempts exactly one refresh (via a separate, interceptor-free
///   Dio instance to avoid recursion), then retries the original request.
/// - Concurrent 401s share a single in-flight refresh instead of each
///   firing their own — otherwise a burst of requests with an expired token
///   would each race to refresh and invalidate each other's new token.
Dio createApiClient() {
  // Without explicit timeouts, an unreachable host (e.g. API_BASE_URL still
  // pointing at "localhost" from an Android emulator or physical device,
  // where that means the device itself, not the dev machine) hangs the
  // request indefinitely — the UI just spins forever instead of showing
  // the "could not connect" state it already has. Fail fast instead.
  const connectTimeout = Duration(seconds: 10);
  const receiveTimeout = Duration(seconds: 15);

  final dio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      headers: {'Content-Type': 'application/json'},
      connectTimeout: connectTimeout,
      receiveTimeout: receiveTimeout,
    ),
  );

  // Separate instance for the refresh call itself — must not carry the
  // request/error interceptors below, or a failed refresh would recurse.
  final refreshDio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: connectTimeout,
      receiveTimeout: receiveTimeout,
    ),
  );

  Future<String>? inFlightRefresh;

  Future<String> refreshAccessToken() {
    return inFlightRefresh ??= () async {
      try {
        final refreshToken = await SecureStorage.getRefreshToken();
        if (refreshToken == null) {
          throw DioException(requestOptions: RequestOptions(path: ApiEndpoints.refresh));
        }

        final response = await refreshDio.post(
          ApiEndpoints.refresh,
          data: {'refreshToken': refreshToken},
        );
        final newAccessToken = response.data['accessToken'] as String;
        await SecureStorage.setAccessToken(newAccessToken);
        return newAccessToken;
      } finally {
        inFlightRefresh = null;
      }
    }();
  }

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureStorage.getAccessToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final isAuthEndpoint = error.requestOptions.path == ApiEndpoints.login ||
            error.requestOptions.path == ApiEndpoints.refresh;

        if (error.response?.statusCode != 401 || isAuthEndpoint) {
          return handler.next(error);
        }

        try {
          final newAccessToken = await refreshAccessToken();
          final retryOptions = error.requestOptions;
          retryOptions.headers['Authorization'] = 'Bearer $newAccessToken';
          final response = await dio.fetch(retryOptions);
          return handler.resolve(response);
        } catch (_) {
          await SecureStorage.clear();
          authFailureController.add(null);
          return handler.next(error);
        }
      },
    ),
  );

  return dio;
}

final apiClientProvider = Provider<Dio>((ref) => createApiClient());

/// Hard wall-clock cutoff on top of Dio's own connectTimeout/receiveTimeout.
///
/// Those are set in [createApiClient] and are enough on Android/iOS (Dio's
/// native IO adapter honors them reliably). On Flutter **Web**, Dio falls
/// back to the browser's XHR/fetch adapter, which does not consistently
/// honor those settings — a hung request there can leave a screen stuck on
/// its loading state forever instead of surfacing the "no connection" error
/// state that already exists. This wraps any request with a plain Dart
/// timer so it always resolves one way or another, on every platform.
Future<Response<T>> withHardTimeout<T>(Future<Response<T>> request, {required String path}) {
  return request.timeout(
    const Duration(seconds: 20),
    onTimeout: () => throw DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionTimeout,
      error: 'Request timed out',
    ),
  );
}
