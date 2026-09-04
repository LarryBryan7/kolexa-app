// inbox_sync_service.dart — refresco de bandeja en segundo plano

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding, AppLifecycleState, WidgetsBindingObserver;

import '../../../core/api/api_client.dart';
import '../../../core/services/push_notifications_service.dart';
import '../ui/inbox_page.dart';
import '../ui/thread_page.dart';
import 'threads_local_store.dart';
import 'threads_repository.dart';

class InboxSyncService with WidgetsBindingObserver {
  InboxSyncService._();
  static final InboxSyncService instance = InboxSyncService._();

  final ValueNotifier<int> unreadCount = ValueNotifier(0);

  final ValueNotifier<int> version = ValueNotifier(0);

  int? _pendingChatsTab;
  final ValueNotifier<int> chatsTabRequests = ValueNotifier(0);

  void requestChatsTab() {
    _pendingChatsTab = 1;
    chatsTabRequests.value++;
  }

  int? consumeChatsTabRequest() {
    final v = _pendingChatsTab;
    _pendingChatsTab = null;
    return v;
  }

  ApiClient? _client;
  void Function(Map<String, dynamic> data)? _pushListener;

  void start(ApiClient client) {
    _client = client;
    _pushListener = (data) {
      if (data['screen'] != 'thread') return;
      refresh();
      final threadId = data['threadId'] as String?;
      if (threadId != null) _prefetchThread(threadId);
    };
    PushNotificationsService.instance.addDataRefreshListener(_pushListener!);
    WidgetsBinding.instance.addObserver(this);
    _seedFromDisk();
    refresh();
  }

  /// Se llama al cerrar sesión (ver main.dart, junto con
  /// `AppDatabase.instance.close()`/los `clearCache()` de mensajería).
  void stop() {
    final listener = _pushListener;
    if (listener != null) PushNotificationsService.instance.removeDataRefreshListener(listener);
    _pushListener = null;
    WidgetsBinding.instance.removeObserver(this);
    _client = null;
    unreadCount.value = 0;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }

  Future<void> _seedFromDisk() async {
    try {
      final local = await ThreadsLocalStore.loadInbox();
      if (_client == null || local.isEmpty) return; // sesión cerrada mientras leía, o nada aún
      unreadCount.value = local.where((t) => t.unread).length;
    } catch (_) {
      // Sin dato local todavía (primera vez en el dispositivo) — refresh()
      // (llamado junto a este método) trae el conteo real de todos modos.
    }
  }

  Future<void> refresh() async {
    final client = _client;
    if (client == null) return;
    try {
      final threads = await ThreadsRepository(client).getInbox();
      if (_client != client) return; // se cerró sesión mientras la red respondía
      InboxPage.primeCache(threads);
      ThreadsLocalStore.saveInbox(threads).catchError((e, st) {
        debugPrint('[InboxSyncService] saveInbox falló: $e\n$st');
      });
      unreadCount.value = threads.where((t) => t.unread).length;
      version.value++;
    } catch (e, st) {
      debugPrint('[InboxSyncService] refresh falló: $e\n$st');
    }
  }

  Future<void> _prefetchThread(String threadId) async {
    final client = _client;
    if (client == null) return;
    try {
      final page = await ThreadsRepository(client).getMessages(threadId);
      if (_client != client) return; // se cerró sesión mientras la red respondía
      ThreadPage.primeCache(threadId, page);
      ThreadsLocalStore.saveThread(threadId, page).catchError((e, st) {
        debugPrint('[InboxSyncService] saveThread falló (hilo $threadId): $e\n$st');
      });
    } catch (e, st) {
      debugPrint('[InboxSyncService] prefetchThread falló (hilo $threadId): $e\n$st');
    }
  }
}
