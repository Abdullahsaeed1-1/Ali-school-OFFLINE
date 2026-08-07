import 'package:envied/envied.dart';

part 'env.g.dart';

/// Compile-time-safe access to `.env`. Values are baked into the binary at
/// build time — never read from the filesystem at runtime.
@Envied(path: '.env')
abstract class Env {
  @EnviedField(varName: 'API_BASE_URL')
  static const String apiBaseUrl = _Env.apiBaseUrl;
}
