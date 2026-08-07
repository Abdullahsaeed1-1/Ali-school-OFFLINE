import 'package:flutter/material.dart';

/// Maps a subject name to a fixed accent color, used consistently for period
/// left-borders, pills, and badges everywhere a subject appears. Mirrors the
/// same mapping used in WebAdmin so a subject reads as the same color in
/// both apps. Subjects not in this list (Physics, Chemistry, Biology,
/// Reading/Writing, Activity, Diary, Arabic, WRA, ...) fall back to
/// [fallback] rather than guessing a color for them.
class SubjectColors {
  SubjectColors._();

  static const Color english = Color(0xFF2563EB);
  static const Color maths = Color(0xFF7C3AED);
  static const Color science = Color(0xFF0891B2);
  static const Color islamiat = Color(0xFFD97706);
  static const Color urdu = Color(0xFFDC2626);
  static const Color games = Color(0xFF16A34A);
  static const Color geography = Color(0xFF9333EA);
  static const Color computerScience = Color(0xFF0F766E);
  static const Color history = Color(0xFFB45309);
  static const Color fallback = Color(0xFF475569);

  static const Map<String, Color> _byName = {
    'English': english,
    'Maths': maths,
    'Science': science,
    'Islamiat': islamiat,
    'Urdu': urdu,
    'Games': games,
    'Geography/SS': geography,
    'Computer Science': computerScience,
    'History': history,
  };

  static Color forSubject(String? subjectName) {
    if (subjectName == null) return fallback;
    return _byName[subjectName] ?? fallback;
  }
}
