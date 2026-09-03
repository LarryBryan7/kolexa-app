// threads_tables.dart — esquema Drift, fiel al esquema sqflite anterior

import 'package:drift/drift.dart';

class InboxThreads extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()();
  TextColumn get subject => text().nullable()();
  TextColumn get studentId => text().named('studentId').nullable()();
  TextColumn get studentName => text().named('studentName').nullable()();
  TextColumn get priority => text()();
  // Epoch millis — ver nota de fechas arriba.
  IntColumn get lastMessageAt => integer().named('lastMessageAt')();
  BoolColumn get unread => boolean()();
  IntColumn get unreadCount => integer().named('unreadCount')();
  BoolColumn get muted => boolean()();
  TextColumn get otherId => text().named('otherId').nullable()();
  TextColumn get otherName => text().named('otherName').nullable()();
  TextColumn get otherAvatar => text().named('otherAvatar').nullable()();
  BoolColumn get otherOnline => boolean().named('otherOnline').nullable()();
  TextColumn get lastMsgBody => text().named('lastMsgBody').nullable()();
  TextColumn get lastMsgSenderId => text().named('lastMsgSenderId').nullable()();
  IntColumn get lastMsgSentAt => integer().named('lastMsgSentAt').nullable()();
  BoolColumn get lastMsgDelivered => boolean().named('lastMsgDelivered').nullable()();
  IntColumn get sortIndex => integer().named('sortIndex')();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('ThreadMessageRow')
class ThreadMessages extends Table {
  TextColumn get id => text()();
  TextColumn get threadId => text().named('threadId')();
  TextColumn get senderId => text().named('senderId')();
  TextColumn get senderName => text().named('senderName')();
  TextColumn get body => text()();
  IntColumn get sentAt => integer().named('sentAt')();

  @override
  Set<Column> get primaryKey => {id};
}

class ThreadMeta extends Table {
  TextColumn get threadId => text().named('threadId')();
  IntColumn get otherLastReadAt => integer().named('otherLastReadAt').nullable()();
  IntColumn get otherLastActiveAt => integer().named('otherLastActiveAt').nullable()();

  @override
  Set<Column> get primaryKey => {threadId};
}

// Mismo motivo que ThreadMessageRow: `Contact` ya es el modelo de dominio
// en threads_repository.dart.
@DataClassName('ContactRow')
class Contacts extends Table {
  TextColumn get userId => text().named('userId')();
  TextColumn get name => text()();
  TextColumn get avatar => text().nullable()();
  TextColumn get role => text()();
  TextColumn get studentsJson => text().named('studentsJson')();
  IntColumn get sortIndex => integer().named('sortIndex')();

  @override
  Set<Column> get primaryKey => {userId};
}
