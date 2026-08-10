// app_router.dart — Configuración de rutas con go_router

import 'dart:async'; // para StreamSubscription
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../features/auth/bloc/auth_bloc.dart';
import '../../features/auth/bloc/auth_state.dart';
import '../../features/auth/ui/login_page.dart';
import '../../features/home/ui/home_page.dart';
import '../../features/home/ui/home_v2_page.dart';
import '../../features/home/ui/home_docente_page.dart';
import '../../features/home/ui/home_director_page.dart';
import '../../features/onboarding/ui/welcome_page.dart';
import '../../features/onboarding/ui/role_selection_page.dart';
import '../../features/classroom/ui/classroom_page.dart';
import '../../features/classroom/bloc/classroom_bloc.dart';
import '../../features/home/ui/esta_semana_page.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

// ── AppRouter ─────────────────────────────────────────────
class AppRouter {
  // Rutas como constantes para evitar strings duplicados
  static const String welcome = '/welcome';
  static const String roleSelection = '/role-selection';
  static const String login = '/login';
  static const String home = '/home';
  static const String classroom = '/classroom';
  static const String estaSemana = '/esta-semana';

  static const Set<String> _publicFlow = {welcome, roleSelection, login};

  // Instancia del GoRouter — se crea una sola vez
  // 'late final' significa: inicialización diferida, no cambia después
  static late GoRouter _router;

  static bool _ready = false;

  // Inicializar el router con el AuthBloc para el refreshListenable
  // Llamar desde main.dart ANTES de crear el MaterialApp
  static GoRouter createRouter(AuthBloc authBloc) {
    // _GoRouterRefreshStream convierte el Stream del BLoC en un ChangeNotifier
    // que go_router puede escuchar para re-evaluar las redirecciones
    final refreshStream = _GoRouterRefreshStream(authBloc.stream);

    _router = GoRouter(
      initialLocation: login,

      refreshListenable: refreshStream,

      // redirect: se llama ANTES de mostrar cada ruta.
      // Decide si redirigir según el estado de Auth.
      redirect: (BuildContext context, GoRouterState state) {
        final authState = authBloc.state;
        final location = state.matchedLocation;

        // Mientras AuthBloc resuelve la sesión el splash nativo cubre todo
        // (preserve en main.dart), así que no hace falta redirigir a nada.
        if (authState is AuthInitial || authState is AuthLoading) {
          return null;
        }

        // Sesión resuelta: navegar al destino.
        if (authState is AuthAuthenticated) {
          if (_publicFlow.contains(location)) return home;
          return null;
        }

        if (authState is AuthUnauthenticated || authState is AuthError) {
          if (!_publicFlow.contains(location)) return login;
          return null;
        }

        return null;
      },

      routes: [
        GoRoute(
          path: welcome,
          builder: (_, __) => const WelcomePage(),
        ),
        GoRoute(
          path: roleSelection,
          builder: (_, __) => const RoleSelectionPage(),
        ),
        GoRoute(
          path: login,
          builder: (_, __) => const LoginPage(),
        ),
        GoRoute(
          path: home,
          builder: (context, state) {
            final authState = context.read<AuthBloc>().state;
            // Parámetro opcional que llega al tocar una notificación
            // de asistencia (se usa para preseleccionar al hijo).
            final studentName = state.uri.queryParameters['studentName'];
            if (authState is AuthAuthenticated) {
              if (authState.user.hasRole('school_admin') ||
                  authState.user.hasRole('director')) {
                return const HomeDirectorPage();
              }
              if (authState.user.hasRole('teacher')) {
                return const HomeDocentePage();
              }
            }
            return HomeV2Page(initialStudentName: studentName);
          },
        ),
        // Ruta de callback deep link OAuth — redirige al home
        GoRoute(
          path: '/connected',
          redirect: (_, __) => home,
        ),
        GoRoute(
          path: '/teacher-connected',
          redirect: (_, __) => home,
        ),
        GoRoute(
          path: estaSemana,
          builder: (context, state) {
            final studentId = state.uri.queryParameters['studentId'] ?? '';
            final studentName = state.uri.queryParameters['studentName'] ?? 'Alumno';
            return EstaSemanPage(
              studentId: studentId,
              studentName: studentName,
            );
          },
        ),
        GoRoute(
          path: classroom,
          builder: (context, state) {
            final studentId = state.uri.queryParameters['studentId'] ?? '';
            final studentName = state.uri.queryParameters['studentName'] ?? 'Alumno';
            return BlocProvider.value(
              value: context.read<ClassroomBloc>()
                ..add(LoadClassroom(studentId)),
              child: ClassroomPage(studentId: studentId, studentName: studentName),
            );
          },
        ),
      ],

      // errorBuilder: página 404 cuando la ruta no existe
      errorBuilder: (context, state) => Scaffold(
        body: Center(
          child: Text('Página no encontrada: ${state.uri}'),
        ),
      ),
    );

    _ready = true;
    return _router;
  }

  static GoRouter get router => _router;

  static bool get isReady => _ready;
}

// ── _GoRouterRefreshStream ────────────────────────────────
class _GoRouterRefreshStream extends ChangeNotifier {
  // Guardamos la suscripción para poder cancelarla en dispose()
  late final StreamSubscription<dynamic> _subscription;

  _GoRouterRefreshStream(Stream<dynamic> stream) {
    // Suscribirse al Stream del BLoC
    _subscription = stream.asBroadcastStream().listen(
          (_) => notifyListeners(), // notificar a go_router en cada estado nuevo
        );
  }

  @override
  void dispose() {
    // IMPORTANTE: siempre cancelar la suscripción para evitar memory leaks
    _subscription.cancel();
    super.dispose();
  }
}
