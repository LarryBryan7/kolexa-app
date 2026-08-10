// auth_bloc.dart — Business Logic Component de Autenticación

import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/repositories/auth_repository.dart';
import 'auth_event.dart';
import 'auth_state.dart';

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  // El BLoC usa el Repository para acceder a los datos.
  // No hace peticiones HTTP directamente.
  final AuthRepository _repository;

  // Constructor: recibimos el Repository por inyección de dependencias.
  // 'super(const AuthInitial())' establece el estado inicial del BLoC.
  AuthBloc(this._repository) : super(const AuthInitial()) {
    on<CheckAuthEvent>(_onCheckAuth);
    on<LoginEvent>(_onLogin);
    on<LogoutEvent>(_onLogout);
    on<ChangePasswordEvent>(_onChangePassword);
  }

  // ── _onCheckAuth ─────────────────────────────────────────
  Future<void> _onCheckAuth(
    CheckAuthEvent event,
    Emitter<AuthState> emit,
  ) async {
    // Mostrar spinner mientras verificamos
    emit(const AuthLoading());

    try {
      // Intentar obtener el usuario guardado localmente
      // (sin hacer petición HTTP — solo lee del SecureStorage)
      final user = await _repository.getCurrentUser();

      if (user != null) {
        // Hay una sesión activa → navegar a Home
        emit(AuthAuthenticated(user));
      } else {
        // No hay sesión → mostrar pantalla de login
        emit(const AuthUnauthenticated());
      }
    } catch (_) {
      // Si algo falla al leer el storage, pedir login
      emit(const AuthUnauthenticated());
    }
  }

  // ── _onLogin ──────────────────────────────────────────────
  // Se ejecuta cuando el usuario presiona "Iniciar Sesión".
  // Llama al backend, guarda los tokens y navega a Home.
  Future<void> _onLogin(
    LoginEvent event,
    Emitter<AuthState> emit,
  ) async {
    // 1. Mostrar indicador de carga
    emit(const AuthLoading());

    try {
      // 2. Llamar al Repository (que llama al DataSource → Backend)
      final user = await _repository.login(
        email: event.email,
        password: event.password,
        firebaseToken: event.firebaseToken,
      );

      // 3. Login exitoso → emitir estado autenticado con los datos del usuario
      emit(AuthAuthenticated(user));
    } catch (e) {
      // 4. Login fallido → emitir error con mensaje legible
      // e.toString() incluye el mensaje que pusimos en _handleError() del ApiClient
      emit(AuthError(e.toString().replaceFirst('Exception: ', '')));
    }
  }

  // ── _onLogout ─────────────────────────────────────────────
  // Se ejecuta cuando el usuario presiona "Cerrar Sesión".
  // Limpia los tokens locales y notifica al backend.
  Future<void> _onLogout(
    LogoutEvent event,
    Emitter<AuthState> emit,
  ) async {
    // Podríamos mostrar un loading, pero el logout es casi instantáneo
    // porque incluso si falla el backend, limpiamos los datos locales
    emit(const AuthLoading());

    try {
      await _repository.logout();
    } catch (_) {
      // El Repository ya maneja errores en logout (ver auth_repository.dart)
      // Siempre llegamos aquí con los datos locales ya limpios
    }

    // Siempre terminamos en Unauthenticated, haya error o no
    emit(const AuthUnauthenticated());
  }

  // ── _onChangePassword ────────────────────────────────────
  // Se ejecuta cuando el usuario confirma el cambio de contraseña.
  Future<void> _onChangePassword(
    ChangePasswordEvent event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());

    try {
      await _repository.changePassword(
        currentPassword: event.currentPassword,
        newPassword: event.newPassword,
      );
      // Emitir estado de éxito para que la UI muestre confirmación
      emit(const AuthPasswordChanged());
    } catch (e) {
      emit(AuthError(e.toString().replaceFirst('Exception: ', '')));
    }
  }
}
