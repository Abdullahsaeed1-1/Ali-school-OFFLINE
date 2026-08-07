import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/building_background.dart';
import '../../../shared/widgets/school_logo.dart';
import '../data/auth_repository.dart';

/// Cinematic entry sequence: building photo → shield logo → school name,
/// while a stored session (if any) is validated in the background. Session
/// resolution and the animation run concurrently — whichever finishes last
/// decides when we navigate, so a slow network never cuts the sequence short
/// and a fast one never gets stuck on a static screen either.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  static const _totalDuration = Duration(milliseconds: 2400);

  late final AnimationController _controller;
  late final Animation<double> _photoFade;
  late final Animation<double> _overlayDeepen;
  late final Animation<double> _logoFade;
  late final Animation<double> _logoScale;
  late final Animation<double> _nameFade;
  late final Animation<double> _estFade;
  late final Animation<double> _contentFadeOut;

  String? _destination;
  bool _animationDone = false;
  bool _navigated = false;

  @override
  void initState() {
    super.initState();

    final reduceMotion = WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;
    _controller = AnimationController(
      vsync: this,
      duration: reduceMotion ? const Duration(milliseconds: 200) : _totalDuration,
    );

    _photoFade = _interval(0, 600, reduceMotion);
    _overlayDeepen = _interval(300, 700, reduceMotion);
    _logoScale = _interval(500, 1000, reduceMotion, curve: Curves.easeOutBack);
    _logoFade = _interval(500, 1000, reduceMotion);
    _nameFade = _interval(900, 1300, reduceMotion);
    _estFade = _interval(1200, 1500, reduceMotion);
    _contentFadeOut = _interval(1800, 2200, reduceMotion);

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _animationDone = true;
        _maybeNavigate();
      }
    });
    _controller.forward();

    _resolveSession();
  }

  CurvedAnimation _interval(int startMs, int endMs, bool reduceMotion, {Curve curve = Curves.easeOut}) {
    final total = reduceMotion ? 200 : _totalDuration.inMilliseconds;
    final start = reduceMotion ? 0.0 : startMs / total;
    final end = reduceMotion ? 1.0 : (endMs / total).clamp(0.0, 1.0);
    return CurvedAnimation(parent: _controller, curve: Interval(start, end, curve: curve));
  }

  Future<void> _resolveSession() async {
    final accessToken = await SecureStorage.getAccessToken();
    var destination = '/login';

    if (accessToken != null) {
      try {
        await ref.read(authRepositoryProvider).fetchMe();
        destination = '/home';
      } catch (_) {
        await SecureStorage.clear();
      }
    }

    _destination = destination;
    _maybeNavigate();
  }

  void _maybeNavigate() {
    if (_navigated || _destination == null || !_animationDone) return;
    _navigated = true;
    if (mounted) context.go(_destination!);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return Stack(
            fit: StackFit.expand,
            children: [
              Opacity(
                opacity: _photoFade.value,
                child: BuildingBackground(
                  overlayColors: [
                    Color.lerp(
                      Colors.black.withValues(alpha: 0.3),
                      AppColors.background.withValues(alpha: 0.92),
                      _overlayDeepen.value,
                    )!,
                    AppColors.background.withValues(alpha: 0.92 + (0.08 * _overlayDeepen.value)),
                  ],
                  overlayStops: const [0, 1],
                ),
              ),
              Opacity(
                opacity: (1 - _contentFadeOut.value),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Transform.scale(
                        scale: 0.6 + (0.4 * _logoScale.value),
                        child: Opacity(
                          opacity: _logoFade.value,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.accentGreen.withValues(alpha: 0.3 * _logoFade.value),
                                  blurRadius: 40,
                                  spreadRadius: 4,
                                ),
                              ],
                            ),
                            child: const SchoolLogo(size: 96),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Opacity(
                        opacity: _nameFade.value,
                        child: Transform.translate(
                          offset: Offset(0, (1 - _nameFade.value) * 8),
                          child: Text(
                            'ALI PUBLIC SCHOOL',
                            style: AppTextStyles.brandTitle.copyWith(fontSize: 18, letterSpacing: 4),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      // TODO: replace with "Est. <year>" once the school confirms its
                      // founding year — not shown yet per the ground-truth rule
                      // against inventing unverified numbers (see CLAUDE.md).
                      Opacity(
                        opacity: _estFade.value,
                        child: Text(
                          'TEACHER PORTAL',
                          style: AppTextStyles.labelMutedSm.copyWith(
                            color: Colors.white.withValues(alpha: 0.5),
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 48,
                child: Opacity(
                  opacity: (1 - _contentFadeOut.value),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 80),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: SizedBox(
                        height: 3,
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: ColoredBox(color: Colors.white.withValues(alpha: 0.15)),
                            ),
                            Positioned.fill(
                              child: FractionallySizedBox(
                                alignment: Alignment.centerLeft,
                                widthFactor: _controller.value,
                                child: const ColoredBox(color: AppColors.accentGreen),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
