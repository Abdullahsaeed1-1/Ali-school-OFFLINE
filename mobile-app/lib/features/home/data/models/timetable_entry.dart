/// A single scheduled period, as embedded in a [TimetableEntry]. Times are
/// kept as raw "HH:MM" strings — see core/utils/date_utils.dart for parsing.
class TimetablePeriod {
  const TimetablePeriod({
    required this.id,
    required this.periodNumber,
    required this.name,
    required this.startTime,
    required this.endTime,
    required this.isBreak,
  });

  factory TimetablePeriod.fromJson(Map<String, dynamic> json) => TimetablePeriod(
        id: json['id'] as String,
        periodNumber: json['periodNumber'] as int,
        name: json['name'] as String,
        startTime: json['startTime'] as String,
        endTime: json['endTime'] as String,
        isBreak: json['isBreak'] as bool? ?? false,
      );

  final String id;
  final int periodNumber;
  final String name;
  final String startTime;
  final String endTime;
  final bool isBreak;
}

/// One scheduled class for a teacher, as returned by
/// GET /timetable/teacher/:teacherId. Note there is no "room" field —
/// the backend data model doesn't track one (see mobile-app CLAUDE.md /
/// docs/excel-ground-truth.md ground-truth rule: don't invent fields).
class TimetableEntry {
  const TimetableEntry({
    required this.id,
    required this.dayOfWeek,
    required this.className,
    required this.subjectName,
    required this.campusName,
    required this.period,
  });

  factory TimetableEntry.fromJson(Map<String, dynamic> json) => TimetableEntry(
        id: json['id'] as String,
        dayOfWeek: json['dayOfWeek'] as String,
        className: (json['class'] as Map<String, dynamic>)['name'] as String,
        subjectName: (json['subject'] as Map<String, dynamic>?)?['name'] as String?,
        campusName: (json['campus'] as Map<String, dynamic>)['name'] as String,
        period: TimetablePeriod.fromJson(json['period'] as Map<String, dynamic>),
      );

  final String id;

  /// "MONDAY".."SUNDAY" — matches the backend's DayOfWeek enum.
  final String dayOfWeek;
  final String className;
  final String? subjectName;
  final String campusName;
  final TimetablePeriod period;
}
