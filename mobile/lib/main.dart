// main.dart — Punto de entrada de la app Flutter

import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'core/services/push_notifications_service.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/app_sizes.dart';
import 'core/api/api_client.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/bloc/auth_event.dart';
import 'features/auth/data/datasources/auth_remote_datasource.dart';
import 'features/auth/data/repositories/auth_repository.dart';
import 'features/classroom/bloc/classroom_bloc.dart';
import 'features/classroom/data/repository/classroom_repository.dart';
import 'core/api/interceptors/auth_interceptor.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase DEBE inicializarse antes de runApp: muchos widgets lo usan
  // en el primer frame (auth, home, banner de notificaciones).
  await Firebase.initializeApp();
  runApp(const KolexaApp());

  unawaited(PushNotificationsService.instance.initialize());
}

class KolexaApp extends StatefulWidget {
  const KolexaApp({super.key});

  @override
  State<KolexaApp> createState() => _KolexaAppState();
}

class _KolexaAppState extends State<KolexaApp> {
  late final ApiClient _apiClient;
  late final AuthBloc _authBloc;
  late final ClassroomBloc _classroomBloc;

  Map<String, dynamic>? _pendingNotification;

  @override
  void initState() {
    super.initState();
    _apiClient = ApiClient();
    final authDataSource = AuthRemoteDataSource(_apiClient);
    final authRepository = AuthRepository(authDataSource);
    _authBloc = AuthBloc(authRepository)..add(const CheckAuthEvent());
    AuthInterceptor.onSessionExpired = () => _authBloc.add(const LogoutEvent());
    _classroomBloc = ClassroomBloc(ClassroomRepository(_apiClient));

    PushNotificationsService.instance.onNotificationTap = _handleNotificationTap;
  }

  // Decide a dónde navegar cuando el usuario toca una notificación.
  // El backend envía `data['screen']` con el destino (ej: 'novedades').
  void _handleNotificationTap(Map<String, dynamic> data) {
    if (!AppRouter.isReady) {
      _pendingNotification = data;
      return;
    }
    _navigateToNotification(data);
  }

  void _navigateToNotification(Map<String, dynamic> data) {
    final screen = data['screen'];
    final studentName = data['studentName'];

    if (screen == 'novedades') {
      final query = studentName != null ? '?studentName=$studentName' : '';
      AppRouter.router.go('${AppRouter.home}$query');
      return;
    }

    // Fallback: cualquier otra notificación lleva al home.
    AppRouter.router.go(AppRouter.home);
  }

  @override
  void dispose() {
    _authBloc.close();
    _classroomBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final router = AppRouter.createRouter(_authBloc);

    if (_pendingNotification != null) {
      final pending = _pendingNotification;
      _pendingNotification = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navigateToNotification(pending!);
      });
    }

    return RepositoryProvider<ApiClient>.value(
      value: _apiClient,
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>.value(value: _authBloc),
          BlocProvider<ClassroomBloc>.value(value: _classroomBloc),
        ],
        child: MaterialApp.router(
          title: 'Kolexa',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.system,
          routerConfig: router,

          builder: (context, child) {
            final width = MediaQuery.of(context).size.width;
            final sizes = width >= 400 ? AppSizes.medium : AppSizes.compact;
            return Theme(
              data: Theme.of(context).copyWith(extensions: [sizes]),
              child: child!,
            );
          },

          // Localización en español: DatePicker, TimePicker y otros
          // widgets de Material mostrarán textos en español
          locale: const Locale('es', 'PE'),
          supportedLocales: const [
            Locale('es', 'PE'), // español Perú
            Locale('en', 'US'), // inglés fallback
          ],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      ),
    );
  }
}
