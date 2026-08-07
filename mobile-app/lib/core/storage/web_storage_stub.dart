/// Non-web platforms never import this — [SecureStorage] only calls into it
/// behind `if (kIsWeb)`, but the conditional-import target still has to
/// exist and type-check for Android/iOS builds.
class WebLocalStorage {
  static void write(String key, String value) {}
  static String? read(String key) => null;
  static void clear() {}
}
