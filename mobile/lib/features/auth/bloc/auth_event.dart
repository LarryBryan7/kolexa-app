// auth_event.dart — Eventos del BLoC de Autenticación

sealed class AuthEvent {
  const AuthEvent();
}

// ── CheckAuthEvent ────────────────────────────────────────
final class CheckAuthEvent extends AuthEvent {
  const CheckAuthEvent();
}

// ── LoginEvent ────────────────────────────────────────────
final class LoginEvent extends AuthEvent {
  final String email;
  final String password;
  final String? firebaseToken; // para registrar el dispositivo en FCM

  const LoginEvent({
    required this.email,
    required this.password,
    this.firebaseToken,
  });

  @override
  String toString() => 'LoginEvent(email: $email)'; // No logueamos la contraseña
}

// ── GoogleLoginEvent ──────────────────────────────────────
final class GoogleLoginEvent extends AuthEvent {
  final String idToken;
  final String? firebaseToken; // para registrar el dispositivo en FCM

  const GoogleLoginEvent({
    required this.idToken,
    this.firebaseToken,
  });

  @override
  String toString() => 'GoogleLoginEvent(idToken: ${idToken.length} chars)';
}

// ── LogoutEvent ───────────────────────────────────────────
// Se dispara cuando el usuario presiona "Cerrar Sesión".
// No lleva datos — solo la intención de cerrar sesión.
final class LogoutEvent extends AuthEvent {
  const LogoutEvent();
}

// ── ChangePasswordEvent ───────────────────────────────────
// Se dispara desde la pantalla de cambio de contraseña.
final class ChangePasswordEvent extends AuthEvent {
  final String currentPassword;
  final String newPassword;

  const ChangePasswordEvent({
    required this.currentPassword,
    required this.newPassword,
  });
}
