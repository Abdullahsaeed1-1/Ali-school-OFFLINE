/// Padding/margin scale, in logical pixels. Use these instead of inlining
/// arbitrary numbers so spacing stays consistent across screens.
class AppSpacing {
  AppSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;

  /// Card corner radius used throughout (period cards, buttons).
  static const double cardRadius = 12;

  /// Larger radius used for the login card's top corners.
  static const double sheetRadius = 28;
}
