class TeacherSubject {
  const TeacherSubject({required this.id, required this.name, required this.isPrimary});

  factory TeacherSubject.fromJson(Map<String, dynamic> json) => TeacherSubject(
        id: json['id'] as String,
        name: json['name'] as String,
        isPrimary: json['isPrimary'] as bool,
      );

  final String id;
  final String name;
  final bool isPrimary;
}

/// The logged-in teacher's own record, from GET /teachers/:id (self-access
/// only — see Backend/src/controllers/teachers.controller.ts getTeacherById).
///
/// Deliberately does NOT map `currentPeriods` or `loadSummary` — neither is
/// ever written anywhere in the backend (confirmed by reading
/// timetableGenerator.ts and grepping for writes to TeacherLoadSummary), so
/// they'd either be stale seed data or always null. "Periods this week" is
/// computed client-side from the teacher's actual timetable entries instead
/// — see ProfileScreen.
class TeacherProfile {
  const TeacherProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.campusName,
    required this.targetPeriodsPerWeek,
    required this.subjects,
    required this.classCount,
  });

  factory TeacherProfile.fromJson(Map<String, dynamic> json) => TeacherProfile(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String?,
        campusName: json['campusName'] as String,
        targetPeriodsPerWeek: json['targetPeriodsPerWeek'] as int,
        subjects: (json['subjects'] as List<dynamic>)
            .map((s) => TeacherSubject.fromJson(s as Map<String, dynamic>))
            .toList(),
        classCount: (json['classEligibilities'] as List<dynamic>).length,
      );

  final String id;
  final String name;
  final String? email;
  final String campusName;
  final int targetPeriodsPerWeek;
  final List<TeacherSubject> subjects;
  final int classCount;

  /// First letters of up to the first two words of the name, e.g. "Ali Khan" → "AK".
  String get initials {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return '?';
    final first = words.first[0];
    final second = words.length > 1 ? words[1][0] : '';
    return (first + second).toUpperCase();
  }
}
