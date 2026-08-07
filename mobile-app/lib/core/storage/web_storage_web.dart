// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;

/// Browser localStorage-backed persistence — used only as the web fallback
/// in [SecureStorage] (the shipped app is Android/iOS; web here is for local
/// dev/testing, so plaintext localStorage instead of true encrypted storage
/// is an accepted tradeoff, same spirit as the in-memory map it replaces,
/// but this one actually survives a page reload).
class WebLocalStorage {
  static void write(String key, String value) {
    html.window.localStorage[key] = value;
  }

  static String? read(String key) => html.window.localStorage[key];

  static void clear() {
    html.window.localStorage.clear();
  }
}
