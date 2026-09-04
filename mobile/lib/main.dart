// main.dart — Punto de entrada de la app Flutter

import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'core/db/app_database.dart';
import 'core/services/push_notifications_service.dart';
import 'core/services/onboarding_service.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/app_sizes.dart';
import 'core/api/api_client.dart';
import 'features/auth/bloc/auth_bloc.dart';
import 'features/auth/bloc/auth_event.dart';
import 'features/auth/bloc/auth_state.dart';
import 'features/auth/data/datasources/auth_remote_datasource.dart';
import 'features/auth/data/repositories/auth_repository.dart';
import 'features/classroom/bloc/classroom_bloc.dart';
import 'features/classroom/data/repository/classroom_repository.dart';
import 'features/threads/data/inbox_sync_service.dart';
import 'features/threads/data/threads_local_store.dart';
import 'features/threads/data/threads_repository.dart';
import 'features/threads/ui/inbox_page.dart';
import 'features/threads/ui/new_message_page.dart';
import 'features/threads/ui/thread_page.dart';
import 'core/api/interceptors/auth_interceptor.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase DEBE inicializarse antes de runApp: muchos widgets lo usan
  // en el primer frame (auth, home, banner de notificaciones).
  await Firebase.initializeApp();
  await OnboardingService.instance.initialize();
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
  late final StreamSubscription<AuthState> _authDbSub;

  Map<String, dynamic>? _pendingNotification;

  @override
  void initState() {
    super.initState();
    _apiClient = ApiClient();
    final authDataSource = AuthRemoteDataSource(_apiClient);
    final authRepository = AuthRepository(authDataSource);
    _authBloc = AuthBloc(authRepository);
    _authDbSub = _authBloc.stream.listen(_handleAuthStateChangeForLocalData);
    _authBloc.add(const CheckAuthEvent());
    AuthInterceptor.onSessionExpired = () => _authBloc.add(const LogoutEvent());
    _classroomBloc = ClassroomBloc(ClassroomRepository(_apiClient));

    PushNotificationsService.instance.onNotificationTap = _handleNotificationTap;

    PushNotificationsService.instance.onTokenRefresh = authRepository.syncPushToken;
  }

  Future<void> _handleAuthStateChangeForLocalData(AuthState state) async {
    if (state is AuthAuthenticated) {
      await AppDatabase.instance.openForUser(state.user.id);
      // Arranca ya (no espera a que el usuario entre a la pestaña Chats) —
      // ver inbox_sync_service.dart.
      InboxSyncService.instance.start(_apiClient);
    } else if (state is AuthUnauthenticated) {
      InboxSyncService.instance.stop();
      InboxPage.clearCache();
      ThreadPage.clearCache();
      NewMessagePage.clearCache();
      await AppDatabase.instance.close();
    }
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

    if (screen == 'thread') {
      final threadId = data['threadId'] as String?;
      if (threadId != null) _openThreadFromNotification(threadId);
      return;
    }

    if (screen == 'novedades') {
      final query = studentName != null ? '?studentName=$studentName' : '';
      AppRouter.router.go('${AppRouter.home}$query');
      return;
    }

    // Fallback: cualquier otra notificación lleva al home.
    AppRouter.router.go(AppRouter.home);
  }

  Future<void> _openThreadFromNotification(String threadId) async {
    var authState = _authBloc.state;
    if (authState is! AuthAuthenticated) {
      authState = await _authBloc.stream.firstWhere(
        (s) => s is AuthAuthenticated || s is AuthUnauthenticated || s is AuthError,
      );
    }
    if (authState is! AuthAuthenticated) return; // no había sesión — nada que abrir

    final nav = AppRouter.router.routerDelegate.navigatorKey.currentState;
    if (nav == null) return;
    nav.popUntil((route) => route.isFirst);
    if (AppRouter.router.routerDelegate.currentConfiguration.uri.path != AppRouter.home) {
      AppRouter.router.go(AppRouter.home);
    }
    InboxSyncService.instance.requestChatsTab();

    List<ThreadSummary> threads = const [];
    try {
      threads = await ThreadsLocalStore.loadInbox();
    } catch (_) {
      // Sin dato local todavía — se abre igual con datos genéricos en vez
      // de no navegar a ningún lado.
    }
    try {
      final page = await ThreadsRepository(_apiClient).getMessages(threadId);
      ThreadPage.primeCache(threadId, page);
      ThreadsLocalStore.saveThread(threadId, page).catchError((e, st) {
        debugPrint('[main] saveThread (notificación) falló: $e\n$st');
      });
    } catch (e, st) {
      debugPrint('[main] getMessages (notificación) falló: $e\n$st');
      // ThreadPage igual los pide sola al montarse — solo se pierde el
      // "ya está todo ahí al instante" para esta apertura puntual.
    }
    ThreadSummary? match;
    for (final t in threads) {
      if (t.id == threadId) {
        match = t;
        break;
      }
    }
    if (!mounted) return;
    nav.push(MaterialPageRoute(
      builder: (_) => ThreadPage(
        threadId: threadId,
        title: match?.otherParticipant?.name ?? 'Conversación',
        avatarUrl: match?.otherParticipant?.avatar,
        online: match?.otherParticipant?.online ?? false,
        otherRole: match?.otherParticipant?.role,
        studentId: match?.studentId,
        studentName: match?.studentName,
      ),
    ));
  }

  @override
  void dispose() {
    _authDbSub.cancel();
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
