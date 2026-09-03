// threads_local_store.dart — Persistencia local (Drift/SQLite) de mensajes

import 'dart:convert';

import 'package:drift/drift.dart';

import '../../../core/db/app_database.dart';
import '../../../core/db/drift/threads_drift_db.dart';
import 'threads_repository.dart';

class ThreadsLocalStore {
  static Future<List<ThreadSummary>> loadInbox() async {
    final db = await AppDatabase.instance.database;
    final rows = await (db.select(db.inboxThreads)
          ..orderBy([(t) => OrderingTerm.asc(t.sortIndex)]))
        .get();
    return rows.map(_threadFromRow).toList();
  }

  static Future<void> saveInbox(List<ThreadSummary> threads) async {
    final db = await AppDatabase.instance.database;
    await db.transaction(() async {
      await db.delete(db.inboxThreads).go();
      for (var i = 0; i < threads.length; i++) {
        await db.into(db.inboxThreads).insert(
              _threadToRow(threads[i], i),
              mode: InsertMode.insertOrReplace,
            );
      }
    });
  }

  static Future<ThreadMessagesPage?> loadThread(String threadId) async {
    final db = await AppDatabase.instance.database;
    final msgRows = await (db.select(db.threadMessages)
          ..where((t) => t.threadId.equals(threadId))
          ..orderBy([(t) => OrderingTerm.asc(t.sentAt)]))
        .get();
    if (msgRows.isEmpty) return null;
    final metaRows =
        await (db.select(db.threadMeta)..where((t) => t.threadId.equals(threadId))).get();
    final meta = metaRows.isNotEmpty ? metaRows.first : null;
    return ThreadMessagesPage(
      messages: msgRows.map(_messageFromRow).toList(),
      otherLastReadAt: meta?.otherLastReadAt != null
          ? DateTime.fromMillisecondsSinceEpoch(meta!.otherLastReadAt!)
          : null,
      otherLastActiveAt: meta?.otherLastActiveAt != null
          ? DateTime.fromMillisecondsSinceEpoch(meta!.otherLastActiveAt!)
          : null,
    );
  }

  static Future<void> saveThread(String threadId, ThreadMessagesPage page) async {
    final db = await AppDatabase.instance.database;
    await db.transaction(() async {
      for (final m in page.messages) {
        await db.into(db.threadMessages).insert(
              _messageToRow(threadId, m),
              mode: InsertMode.insertOrReplace,
            );
      }
      await db.into(db.threadMeta).insert(
            _metaToRow(threadId, page),
            mode: InsertMode.insertOrReplace,
          );
    });
  }

  static Future<void> saveMessage(String threadId, ThreadMessage message) async {
    final db = await AppDatabase.instance.database;
    await db.into(db.threadMessages).insert(
          _messageToRow(threadId, message),
          mode: InsertMode.insertOrReplace,
        );
  }

  static Future<List<Contact>> loadContacts() async {
    final db = await AppDatabase.instance.database;
    final rows =
        await (db.select(db.contacts)..orderBy([(t) => OrderingTerm.asc(t.sortIndex)])).get();
    return rows.map(_contactFromRow).toList();
  }

  static Future<void> saveContacts(List<Contact> contacts) async {
    final db = await AppDatabase.instance.database;
    await db.transaction(() async {
      await db.delete(db.contacts).go();
      for (var i = 0; i < contacts.length; i++) {
        await db.into(db.contacts).insert(
              _contactToRow(contacts[i], i),
              mode: InsertMode.insertOrReplace,
            );
      }
    });
  }

  // ── mapeo fila (Drift) ↔ modelo (threads_repository.dart) ──

  static InboxThreadsCompanion _threadToRow(ThreadSummary t, int index) => InboxThreadsCompanion.insert(
        id: t.id,
        kind: t.kind,
        subject: Value(t.subject),
        studentId: Value(t.studentId),
        studentName: Value(t.studentName),
        priority: t.priority,
        lastMessageAt: t.lastMessageAt.millisecondsSinceEpoch,
        unread: t.unread,
        unreadCount: t.unreadCount,
        muted: t.muted,
        otherId: Value(t.otherParticipant?.id),
        otherName: Value(t.otherParticipant?.name),
        otherAvatar: Value(t.otherParticipant?.avatar),
        otherOnline: Value(t.otherParticipant?.online),
        lastMsgBody: Value(t.lastMessage?.body),
        lastMsgSenderId: Value(t.lastMessage?.senderId),
        lastMsgSentAt: Value(t.lastMessage?.sentAt.millisecondsSinceEpoch),
        lastMsgDelivered: Value(t.lastMessage?.delivered),
        sortIndex: index,
      );

  static ThreadSummary _threadFromRow(InboxThread row) => ThreadSummary(
        id: row.id,
        kind: row.kind,
        subject: row.subject,
        studentId: row.studentId,
        studentName: row.studentName,
        priority: row.priority,
        lastMessageAt: DateTime.fromMillisecondsSinceEpoch(row.lastMessageAt),
        unread: row.unread,
        unreadCount: row.unreadCount,
        muted: row.muted,
        otherParticipant: row.otherId != null
            ? ThreadOtherParticipant(
                id: row.otherId!,
                name: row.otherName ?? '',
                avatar: row.otherAvatar,
                online: row.otherOnline ?? false,
              )
            : null,
        lastMessage: row.lastMsgBody != null
            ? ThreadPreview(
                body: row.lastMsgBody!,
                senderId: row.lastMsgSenderId!,
                sentAt: DateTime.fromMillisecondsSinceEpoch(row.lastMsgSentAt!),
                delivered: row.lastMsgDelivered ?? false,
              )
            : null,
      );

  static ThreadMessagesCompanion _messageToRow(String threadId, ThreadMessage m) =>
      ThreadMessagesCompanion.insert(
        id: m.id,
        threadId: threadId,
        senderId: m.senderId,
        senderName: m.senderName,
        body: m.body,
        sentAt: m.sentAt.millisecondsSinceEpoch,
      );

  static ThreadMessage _messageFromRow(ThreadMessageRow row) => ThreadMessage(
        id: row.id,
        senderId: row.senderId,
        senderName: row.senderName,
        body: row.body,
        sentAt: DateTime.fromMillisecondsSinceEpoch(row.sentAt),
      );

  static ThreadMetaCompanion _metaToRow(String threadId, ThreadMessagesPage page) =>
      ThreadMetaCompanion.insert(
        threadId: threadId,
        otherLastReadAt: Value(page.otherLastReadAt?.millisecondsSinceEpoch),
        otherLastActiveAt: Value(page.otherLastActiveAt?.millisecondsSinceEpoch),
      );

  static ContactsCompanion _contactToRow(Contact c, int index) => ContactsCompanion.insert(
        userId: c.userId,
        name: c.name,
        avatar: Value(c.avatar),
        role: c.role,
        studentsJson: jsonEncode(c.students.map((s) => {'id': s.id, 'name': s.name}).toList()),
        sortIndex: index,
      );

  static Contact _contactFromRow(ContactRow row) => Contact(
        userId: row.userId,
        name: row.name,
        avatar: row.avatar,
        role: row.role,
        students: (jsonDecode(row.studentsJson) as List<dynamic>)
            .map((s) => ThreadStudentRef(
                id: (s as Map<String, dynamic>)['id'] as String, name: s['name'] as String))
            .toList(),
      );
}
