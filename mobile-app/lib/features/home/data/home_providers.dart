import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/session.dart';
import 'models/teacher_profile.dart';
import 'models/timetable_entry.dart';
import 'teacher_repository.dart';
import 'timetable_repository.dart';

Future<String> _requireTeacherId(Ref ref) async {
  final teacherId = await ref.watch(currentTeacherIdProvider.future);
  if (teacherId == null) {
    throw StateError('No teacher session found — this screen requires a logged-in teacher.');
  }
  return teacherId;
}

final teacherProfileProvider = FutureProvider.autoDispose<TeacherProfile>((ref) async {
  final teacherId = await _requireTeacherId(ref);
  return ref.watch(teacherRepositoryProvider).fetchSelf(teacherId);
});

final timetableEntriesProvider = FutureProvider.autoDispose<List<TimetableEntry>>((ref) async {
  final teacherId = await _requireTeacherId(ref);
  return ref.watch(timetableRepositoryProvider).fetchForTeacher(teacherId);
});
