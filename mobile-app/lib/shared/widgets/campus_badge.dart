import 'package:flutter/material.dart';

import '../../core/constants/app_text_styles.dart';

/// Mirrors WebAdmin's campus pill colors exactly (web-admin/src/components/ui/Badge.tsx
/// + web-admin/src/pages/teachers/TeachersPage.tsx), including its string-matching
/// on campus name — WebAdmin doesn't have a typed campus field to key off of
/// here either, so this isn't a shortcut, it's the same approach already in
/// production elsewhere in this system.
class CampusBadge extends StatelessWidget {
  const CampusBadge({super.key, required this.campusName});

  final String campusName;

  @override
  Widget build(BuildContext context) {
    final Color base;
    final Color textColor;
    if (campusName.contains('Girls')) {
      base = const Color(0xFF4A1942);
      textColor = const Color(0xFFE2E8F0);
    } else if (campusName.contains('Boys')) {
      base = const Color(0xFF0F3D3E);
      textColor = const Color(0xFFE2E8F0);
    } else {
      base = const Color(0xFF1B2A6B);
      textColor = const Color(0xFFC9A84C);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: base.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: base.withValues(alpha: 0.4)),
      ),
      child: Text(
        campusName,
        style: AppTextStyles.labelMutedSm.copyWith(color: textColor, letterSpacing: 0),
      ),
    );
  }
}
