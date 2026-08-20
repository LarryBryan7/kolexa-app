// auth_state.dart — Estados del BLoC de Autenticación

import '../data/models/user_model.dart';

// Clase base de todos los estados de autenticación
sealed class AuthState {
  const AuthState();
}

// ── AuthInitial ───────────────────────────────────────────
final class AuthInitial extends AuthState {
  const AuthInitial();
}

// ── AuthLoading ───────────────────────────────────────────
final class AuthLoading extends AuthState {
  const AuthLoading();
}

// ── AuthAuthenticated ─────────────────────────────────────
final class AuthAuthenticated extends AuthState {
  final UserModel user; // El usuario autenticado con sus datos

  const AuthAuthenticated(this.user);

  @override
  String toString() => 'AuthAuthenticated(user: ${user.email})';
}

// ── AuthUnauthenticated ───────────────────────────────────
// No hay sesión activa. La app debe mostrar la pantalla de login.
// También se emite después de un logout exitoso.
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

// ── AuthError ─────────────────────────────────────────────
final class AuthError extends AuthState {
  final String message; // Mensaje de error legible para el usuario

  const AuthError(this.message);

  @override
  String toString() => 'AuthError(message: $message)';
}

// ── AuthPasswordChanged ───────────────────────────────────
// El cambio de contraseña fue exitoso.
// La UI puede mostrar un SnackBar de éxito y navegar atrás.
final class AuthPasswordChanged extends AuthState {
  const AuthPasswordChanged();
}
