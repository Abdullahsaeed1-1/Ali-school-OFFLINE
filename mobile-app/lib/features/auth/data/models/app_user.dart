class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.role,
    required this.teacherId,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        email: json['email'] as String,
        role: json['role'] as String,
        teacherId: json['teacherId'] as String?,
      );

  final String id;
  final String email;
  final String role;
  final String? teacherId;
}
