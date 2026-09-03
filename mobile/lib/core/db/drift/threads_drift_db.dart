// threads_drift_db.dart — base de datos Drift para la pestaña de mensajes

import 'package:drift/drift.dart';

import 'threads_tables.dart';

part 'threads_drift_db.g.dart';

@DriftDatabase(tables: [InboxThreads, ThreadMessages, ThreadMeta, Contacts])
class ThreadsDriftDb extends _$ThreadsDriftDb {
  ThreadsDriftDb(super.executor);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) async {
          await m.createAll();
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_thread_messages_threadId ON thread_messages (threadId)',
          );
        },
      );
}
