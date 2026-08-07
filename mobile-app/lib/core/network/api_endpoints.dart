/// All backend endpoint paths, relative to [Env.apiBaseUrl]. Keep in sync
/// with mobile-app/CLAUDE.md's "Backend endpoints this app uses" list.
class ApiEndpoints {
  ApiEndpoints._();

  static const login = '/auth/login';
  static const refresh = '/auth/refresh';
  static const logout = '/auth/logout';
  static const me = '/auth/me';

  static String teacherTimetable(String teacherId) => '/timetable/teacher/$teacherId';
  static String teacherById(String teacherId) => '/teachers/$teacherId';

  static const registerFcmToken = '/notifications/register';
}
