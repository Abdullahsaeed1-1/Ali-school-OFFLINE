import 'package:dio/dio.dart';

/// True for Dio errors that mean "couldn't reach the server at all" — as
/// opposed to the server responding with an error status. Used to show a
/// "no connection" message instead of a generic failure.
bool isConnectivityError(Object? error) {
  if (error is! DioException) return false;
  switch (error.type) {
    case DioExceptionType.connectionError:
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.sendTimeout:
      return true;
    default:
      return false;
  }
}
