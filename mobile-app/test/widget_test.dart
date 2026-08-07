import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ali_school_teacher_app/features/auth/presentation/login_screen.dart';

void main() {
  testWidgets('Login screen renders email, password, and sign-in button', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: LoginScreen()),
      ),
    );
    // Let the entrance animation (1.2s) finish so faded-in fields are visible.
    await tester.pump(const Duration(milliseconds: 1300));

    expect(find.text('ALI PUBLIC SCHOOL'), findsOneWidget);
    expect(find.text('Teacher Portal'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
  });
}
