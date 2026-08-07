import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models/timetable_entry.dart';

class TimetableRepository {
  TimetableRepository(this._dio);

  final Dio _dio;

  /// Matches the backend's own hardcoded default (see
  /// Backend/src/controllers/timetable.controller.ts resolveYear) — there's
  /// no "current academic year" concept anywhere else in the system yet.
  static const academicYear = '2025-2026';

  Future<List<TimetableEntry>> fetchForTeacher(String teacherId) async {
    final path = ApiEndpoints.teacherTimetable(teacherId);
    final response = await withHardTimeout(
      _dio.get<Map<String, dynamic>>(path, queryParameters: {'academicYear': academicYear}),
      path: path,
    );
    final entries = response.data!['data'] as List<dynamic>;
    return entries.map((e) => TimetableEntry.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final timetableRepositoryProvider = Provider<TimetableRepository>(
  (ref) => TimetableRepository(ref.watch(apiClientProvider)),
);
