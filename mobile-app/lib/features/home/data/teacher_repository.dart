import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models/teacher_profile.dart';

class TeacherRepository {
  TeacherRepository(this._dio);

  final Dio _dio;

  Future<TeacherProfile> fetchSelf(String teacherId) async {
    final path = ApiEndpoints.teacherById(teacherId);
    final response = await withHardTimeout(_dio.get<Map<String, dynamic>>(path), path: path);
    return TeacherProfile.fromJson(response.data!['data'] as Map<String, dynamic>);
  }
}

final teacherRepositoryProvider = Provider<TeacherRepository>(
  (ref) => TeacherRepository(ref.watch(apiClientProvider)),
);
