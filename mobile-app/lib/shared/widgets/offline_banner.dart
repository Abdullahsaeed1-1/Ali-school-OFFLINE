import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/constants/app_text_styles.dart';

/// Shown above still-visible cached content when a refresh fails due to
/// connectivity — maroon is reserved for alerts/warnings per the brand
/// tokens, which is exactly what this is.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.maroon.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(AppSpacing.cardRadius),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_rounded, size: 16, color: AppColors.maroon),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'No connection — showing last synced data',
              style: AppTextStyles.labelMuted.copyWith(color: AppColors.maroon),
            ),
          ),
        ],
      ),
    );
  }
}
