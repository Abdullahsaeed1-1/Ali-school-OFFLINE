import 'package:flutter/material.dart';

/// Ali Public School brand tokens. Use these exact values everywhere —
/// never inline a hex color in a widget.
class AppColors {
  AppColors._();

  static const Color background = Color(0xFF080C14);
  static const Color surface = Color(0xFF0E1420);
  static const Color card = Color(0xFF131C2E);

  static const Color primaryBlue = Color(0xFF143782);
  static const Color accentGreen = Color(0xFFB4DC78);
  static const Color maroon = Color(0xFF7B1F2E);

  static const Color white = Color(0xFFFFFFFF);
  static const Color textPrimary = Color(0xFFF0F4FF);
  static const Color textMuted = Color(0xFF5A6A8A);
  static const Color border = Color(0xFF1A2540);

  /// Left border gradient for the "Now" indicator on the current period card.
  static const List<Color> nowGradient = [primaryBlue, accentGreen];

  /// Base color for the dark gradient overlay drawn over the school-building
  /// photo on Login/Home/Timetable — rgb(10,15,40), a hair bluer than
  /// [background] so the photo reads through more warmly at low opacity.
  static const Color photoOverlay = Color(0xFF0A0F28);

  // ---------------------------------------------------------------------
  // Profile screen's bottom sheet is a deliberate light surface (per the
  // redesign spec) sitting below the dark photo header — its own small
  // on-white palette, distinct from the rest of the (dark) app.
  // ---------------------------------------------------------------------
  static const Color onWhiteText = Color(0xFF0D1B3E);
  static const Color onWhiteMuted = Color(0xFF64748B);
  static const Color onWhiteTrack = Color(0xFFE2E8F0);
  static const Color onWhiteSurface = Color(0xFFF7F9FC);
}
