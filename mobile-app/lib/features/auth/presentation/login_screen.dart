import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../shared/widgets/building_background.dart';
import '../../../shared/widgets/school_logo.dart';
import '../data/auth_repository.dart';
import '../data/session.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.sessionExpired = false});

  /// True when the router redirected here after a 401-refresh failure
  /// elsewhere in the app — shown as a notice rather than silently landing
  /// on the login screen with no explanation.
  final bool sessionExpired;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with SingleTickerProviderStateMixin {
  static const _totalDuration = Duration(milliseconds: 1200);

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  late final AnimationController _controller;
  late final Animation<double> _topFade;
  late final Animation<double> _logoScale;
  late final Animation<double> _cardSlide;
  late final Animation<double> _emailFade;
  late final Animation<double> _passwordFade;
  late final Animation<double> _buttonFade;

  bool _obscurePassword = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.sessionExpired) {
      _error = 'Your session expired. Please sign in again.';
    }
    final reduceMotion = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    _controller = AnimationController(
      vsync: this,
      duration: reduceMotion ? const Duration(milliseconds: 1) : _totalDuration,
    );

    _topFade = _interval(0, 300);
    _logoScale = _interval(0, 400, curve: Curves.easeOutBack);
    _cardSlide = _interval(150, 650);
    _emailFade = _interval(350, 650);
    _passwordFade = _interval(430, 730);
    _buttonFade = _interval(510, 810);

    _controller.forward();
  }

  CurvedAnimation _interval(int startMs, int endMs, {Curve curve = Curves.easeOut}) {
    return CurvedAnimation(
      parent: _controller,
      curve: Interval(
        startMs / _totalDuration.inMilliseconds,
        endMs / _totalDuration.inMilliseconds,
        curve: curve,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Please enter your email and password.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref.read(authRepositoryProvider).login(email: email, password: password);
      // The previous session (if any) may have cached a different teacher's
      // id — force it to re-read from secure storage now that a new session
      // has been saved, or Home/Profile would keep requesting the old
      // teacher's data with the new teacher's token and get rejected.
      ref.invalidate(currentTeacherIdProvider);
      if (mounted) context.go('/home');
    } on DioException catch (e) {
      setState(() {
        _error = e.response?.statusCode == 401
            ? 'Incorrect email or password.'
            : 'Could not reach the server. Please try again.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const BuildingBackground(
            overlayColors: [
              Color(0x660A0F28),
              Color(0xD90A0F28),
            ],
          ),
          Column(
            children: [
              Expanded(
                flex: 40,
                child: FadeTransition(
                  opacity: _topFade,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ScaleTransition(
                          scale: _logoScale,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentGreen.withValues(alpha: 0.25),
                                  blurRadius: 28,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                            child: const SchoolLogo(size: 72),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          'ALI PUBLIC SCHOOL',
                          style: AppTextStyles.brandTitle.copyWith(fontSize: 16, letterSpacing: 3),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          'Teacher Portal',
                          style: GoogleFonts.inter(fontSize: 13, color: Colors.white.withValues(alpha: 0.65)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                flex: 60,
                child: AnimatedBuilder(
                  animation: _cardSlide,
                  builder: (context, child) => Transform.translate(
                    offset: Offset(0, (1 - _cardSlide.value) * 60),
                    child: Opacity(opacity: _cardSlide.value, child: child),
                  ),
                  child: _buildGlassCard(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildGlassCard() {
    return ClipRRect(
      borderRadius: const BorderRadius.only(
        topLeft: Radius.circular(AppSpacing.sheetRadius),
        topRight: Radius.circular(AppSpacing.sheetRadius),
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(AppSpacing.sheetRadius),
              topRight: Radius.circular(AppSpacing.sheetRadius),
            ),
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.2))),
          ),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.xl,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Welcome back',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w300,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Sign in to continue',
                  style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w600, color: Colors.white),
                ),
                const SizedBox(height: AppSpacing.lg),
                FadeTransition(
                  opacity: _emailFade,
                  child: TextField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    style: GoogleFonts.inter(color: Colors.white),
                    decoration: _inputDecoration('Email'),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                FadeTransition(
                  opacity: _passwordFade,
                  child: TextField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    style: GoogleFonts.inter(color: Colors.white),
                    onSubmitted: (_) => _handleLogin(),
                    decoration: _inputDecoration('Password').copyWith(
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          color: Colors.white.withValues(alpha: 0.6),
                          size: 20,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                FadeTransition(
                  opacity: _buttonFade,
                  child: SizedBox(
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        disabledBackgroundColor: AppColors.primaryBlue.withValues(alpha: 0.6),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(color: AppColors.accentGreen.withValues(alpha: 0.4)),
                        ),
                        elevation: 0,
                      ),
                      child: _loading
                          ? Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.white),
                                ),
                                const SizedBox(width: AppSpacing.sm),
                                Text('Signing in...', style: AppTextStyles.buttonText),
                              ],
                            )
                          : Text('Sign in', style: AppTextStyles.buttonText),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  FadeTransition(
                    opacity: _buttonFade,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: AppColors.maroon.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        _error!,
                        style: GoogleFonts.inter(fontSize: 13, color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.1),
      hintText: hint,
      hintStyle: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.4)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.accentGreen.withValues(alpha: 0.8), width: 1.5),
      ),
    );
  }
}
