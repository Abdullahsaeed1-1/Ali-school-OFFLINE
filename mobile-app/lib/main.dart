import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/constants/app_colors.dart';
import 'core/router/app_router.dart';

void main() {
  runApp(const ProviderScope(child: AliSchoolApp()));
}

class AliSchoolApp extends StatelessWidget {
  const AliSchoolApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Ali Public School',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: ThemeData.dark().colorScheme.copyWith(
              primary: AppColors.primaryBlue,
              secondary: AppColors.accentGreen,
              surface: AppColors.surface,
              error: AppColors.maroon,
            ),
      ),
      routerConfig: appRouter,
    );
  }
}
