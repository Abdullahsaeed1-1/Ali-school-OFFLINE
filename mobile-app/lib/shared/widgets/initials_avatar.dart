import 'package:flutter/material.dart';

import '../../core/constants/app_text_styles.dart';

/// A circular avatar showing a teacher's initials on a frosted-glass
/// background — used on the Home greeting and Profile header, both of which
/// now sit over the school-building photo.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.initials, this.size = 44, this.borderWidth = 1});

  final String initials;
  final double size;
  final double borderWidth;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.15),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: borderWidth),
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: AppTextStyles.bodyMd.copyWith(
          fontWeight: FontWeight.w600,
          color: Colors.white,
          fontSize: size * 0.36,
        ),
      ),
    );
  }
}
