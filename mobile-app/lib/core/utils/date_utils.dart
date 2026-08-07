import 'package:intl/intl.dart';

class AppDateUtils {
  AppDateUtils._();

  static const _dayOfWeekNames = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];

  /// Dart's DateTime.weekday is 1 (Monday) .. 7 (Sunday) — the same order as
  /// the backend's DayOfWeek enum, so this is a direct index lookup.
  static String dayOfWeekFor(DateTime date) => _dayOfWeekNames[date.weekday - 1];

  /// e.g. "Monday, 7 July".
  static String formatFriendlyDate(DateTime date) => DateFormat('EEEE, d MMMM').format(date);

  /// Hour buckets: [5, 12) morning, [12, 17) afternoon, [17, 21) evening,
  /// everything else (21:00–04:59) night — the old version only had three
  /// buckets, so 1am/2am/3am all fell into "< 12" and showed "Good morning".
  static String greetingFor(DateTime time) {
    if (time.hour >= 5 && time.hour < 12) return 'Good morning,';
    if (time.hour < 17) return 'Good afternoon,';
    if (time.hour < 21) return 'Good evening,';
    return 'Good night,';
  }

  /// Minutes since midnight for a "HH:MM" period time string.
  static int _minutesOf(String hhmm) {
    final parts = hhmm.split(':');
    return int.parse(parts[0]) * 60 + int.parse(parts[1]);
  }

  static bool isPeriodNow(String startTime, String endTime, DateTime now) {
    final nowMinutes = now.hour * 60 + now.minute;
    return nowMinutes >= _minutesOf(startTime) && nowMinutes < _minutesOf(endTime);
  }

  static bool isPeriodPast(String endTime, DateTime now) {
    final nowMinutes = now.hour * 60 + now.minute;
    return nowMinutes >= _minutesOf(endTime);
  }

  /// Minutes remaining until [endTime] ("HH:MM"), clamped to >= 0 — used by
  /// the Home screen's "NOW" card countdown.
  static int minutesUntil(String endTime, DateTime now) {
    final nowMinutes = now.hour * 60 + now.minute;
    return (_minutesOf(endTime) - nowMinutes).clamp(0, 24 * 60);
  }

  /// "Ends in 23 min" / "Ends in 1h 5min".
  static String formatMinutesRemaining(int minutes) {
    if (minutes < 60) return 'Ends in $minutes min';
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? 'Ends in ${hours}h' : 'Ends in ${hours}h ${rest}min';
  }

  /// "09:00" → "9:00 AM" for display.
  static String formatPeriodTime(String hhmm) {
    final minutes = _minutesOf(hhmm);
    final time = DateTime(2000, 1, 1, minutes ~/ 60, minutes % 60);
    return DateFormat('h:mm a').format(time);
  }
}
