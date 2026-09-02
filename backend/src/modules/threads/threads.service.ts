// threads.service.ts — Mensajería 1:1 (padre ↔ docente ↔ director)

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface ThreadSummary {
  id: string;
  kind: string;
  subject: string | null;
  studentId: string | null;
  studentName: string | null;
  priority: string;
  lastMessageAt: Date;
  unread: boolean;
  unreadCount: number;
  muted: boolean;
  otherParticipant: { id: string; name: string; avatar: string | null; online: boolean } | null;
  lastMessage: { body: string; senderId: string; sentAt: Date; delivered: boolean } | null;
}

export interface ThreadMessageView {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: Date;
  editedAt: Date | null;
}

export interface Contact {
  userId: string;
  name: string;
  avatar: string | null;
  role: string;
  // Alumno(s) que hacen válida esta conversación. Vacío para hilos con el
  // director, donde no hace falta indicar uno.
  students: { id: string; name: string }[];
}

const ADMIN_ROLES = ['school_admin', 'director'];
const isAdmin = (roles: string[]) => roles.some((r) => ADMIN_ROLES.includes(r));

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
const isOnline = (lastActiveAt: Date | null) =>
  !!lastActiveAt && Date.now() - lastActiveAt.getTime() < ONLINE_THRESHOLD_MS;

@Injectable()
export class ThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Bandeja ───────────────────────────────────────────────
  async getInbox(userId: bigint, schoolId: bigint): Promise<ThreadSummary[]> {
    const parts = await this.prisma.threadParticipant.findMany({
      where: { userId, thread: { schoolId } },
      select: {
        lastReadAt: true,
        mutedAt: true,
        thread: {
          select: {
            id: true,
            kind: true,
            subject: true,
            studentId: true,
            priority: true,
            lastMessageAt: true,
            student: { select: { firstName: true, lastName: true } },
            participants: {
              where: { userId: { not: userId } },
              select: {
                lastReadAt: true,
                user: {
                  select: { id: true, firstName: true, lastName: true, avatar: true, lastActiveAt: true },
                },
              },
            },
          },
        },
      },
      orderBy: { thread: { lastMessageAt: 'desc' } },
    });

    if (parts.length === 0) return [];

    const threadIds = parts.map((p) => p.thread.id);
    const allMessages = await this.prisma.threadMessage.findMany({
      where: { threadId: { in: threadIds }, deletedAt: null },
      orderBy: { sentAt: 'desc' },
      select: { threadId: true, body: true, senderId: true, sentAt: true },
    });
    const lastByThread = new Map<string, (typeof allMessages)[number]>();
    const sentAtsByThread = new Map<string, Date[]>();
    for (const m of allMessages) {
      const key = m.threadId.toString();
      if (!lastByThread.has(key)) lastByThread.set(key, m);
      if (m.senderId !== userId) {
        const arr = sentAtsByThread.get(key);
        if (arr) arr.push(m.sentAt);
        else sentAtsByThread.set(key, [m.sentAt]);
      }
    }

    return parts
      .map((p) => {
        const t = p.thread;
        const otherPart = t.participants[0] ?? null;
        const other = otherPart?.user ?? null;
        const last = lastByThread.get(t.id.toString()) ?? null;
        const delivered =
          !!last &&
          ((!!otherPart?.lastReadAt && otherPart.lastReadAt >= last.sentAt) ||
            (!!other?.lastActiveAt && other.lastActiveAt >= last.sentAt));
        return {
          id: t.id.toString(),
          kind: t.kind,
          subject: t.subject,
          studentId: t.studentId?.toString() ?? null,
          studentName: t.student
            ? `${t.student.firstName} ${t.student.lastName ?? ''}`.trim()
            : null,
          priority: t.priority,
          lastMessageAt: t.lastMessageAt,
          unread: !p.lastReadAt || p.lastReadAt < t.lastMessageAt,
          unreadCount: (sentAtsByThread.get(t.id.toString()) ?? []).filter(
            (sentAt) => !p.lastReadAt || sentAt > p.lastReadAt,
          ).length,
          muted: !!p.mutedAt,
          otherParticipant: other
            ? {
                id: other.id.toString(),
                name: `${other.firstName} ${other.lastName ?? ''}`.trim(),
                avatar: other.avatar,
                online: isOnline(other.lastActiveAt),
              }
            : null,
          lastMessage: last
            ? {
                body: this.stripMentions(last.body),
                senderId: last.senderId.toString(),
                sentAt: last.sentAt,
                delivered,
              }
            : null,
        };
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  async getUnreadCount(userId: bigint, schoolId: bigint): Promise<number> {
    const parts = await this.prisma.threadParticipant.findMany({
      where: { userId, thread: { schoolId } },
      select: { lastReadAt: true, thread: { select: { lastMessageAt: true } } },
    });
    return parts.filter((p) => !p.lastReadAt || p.lastReadAt < p.thread.lastMessageAt)
      .length;
  }

  // ── Contactos válidos para empezar una conversación ──────────
  async getContacts(schoolId: bigint, user: { id: bigint; roles: string[] }): Promise<Contact[]> {
    const adminsPromise = this.prisma.user.findMany({
      where: {
        id: { not: user.id },
        deletedAt: null,
        userRoles: { some: { schoolId, role: { name: { in: ADMIN_ROLES } } } },
      },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    const toAdminContacts = (admins: Awaited<typeof adminsPromise>): Contact[] =>
      admins.map((a) => ({
        userId: a.id.toString(),
        name: `${a.firstName} ${a.lastName ?? ''}`.trim(),
        avatar: a.avatar,
        role: 'school_admin',
        students: [],
      }));

    if (isAdmin(user.roles)) {
      const [admins, staff] = await Promise.all([
        adminsPromise,
        this.prisma.user.findMany({
          where: {
            id: { not: user.id },
            deletedAt: null,
            userRoles: { some: { schoolId, role: { name: 'teacher' } } },
          },
          select: { id: true, firstName: true, lastName: true, avatar: true },
        }),
      ]);
      const adminContacts = toAdminContacts(admins);
      const staffContacts: Contact[] = staff.map((t) => ({
        userId: t.id.toString(),
        name: `${t.firstName} ${t.lastName ?? ''}`.trim(),
        avatar: t.avatar,
        role: 'teacher',
        students: [],
      }));
      return [...staffContacts, ...adminContacts];
    }

    if (user.roles.includes('parent')) {
      const [admins, rows] = await Promise.all([
        adminsPromise,
        this.prisma.$queryRaw<
          {
            teacher_id: bigint;
            teacher_first_name: string;
            teacher_last_name: string | null;
            teacher_avatar: string | null;
            student_id: bigint;
            student_first_name: string;
            student_last_name: string | null;
          }[]
        >`
          SELECT DISTINCT
            cc.teacher_id AS teacher_id,
            tu.first_name AS teacher_first_name,
            tu.last_name AS teacher_last_name,
            tu.avatar_url AS teacher_avatar,
            s.id AS student_id,
            s.first_name AS student_first_name,
            s.last_name AS student_last_name
          FROM user_students us
          JOIN students s ON s.id = us.student_id
          JOIN student_enrollments se ON se.student_id = us.student_id AND se.is_active = true
          JOIN classroom_courses cc ON cc.classroom_id = se.classroom_id AND cc.teacher_id IS NOT NULL
          JOIN users tu ON tu.id = cc.teacher_id
          WHERE us.user_id = ${user.id}
        `,
      ]);
      const adminContacts = toAdminContacts(admins);

      const byTeacher = new Map<
        string,
        { name: string; avatar: string | null; students: Map<string, string> }
      >();
      for (const row of rows) {
        const key = row.teacher_id.toString();
        if (!byTeacher.has(key)) {
          byTeacher.set(key, {
            name: `${row.teacher_first_name} ${row.teacher_last_name ?? ''}`.trim(),
            avatar: row.teacher_avatar,
            students: new Map(),
          });
        }
        byTeacher.get(key)!.students.set(
          row.student_id.toString(),
          `${row.student_first_name} ${row.student_last_name ?? ''}`.trim(),
        );
      }

      const teacherContacts: Contact[] = [...byTeacher.entries()].map(([id, v]) => ({
        userId: id,
        name: v.name,
        avatar: v.avatar,
        role: 'teacher',
        students: [...v.students.entries()].map(([sid, name]) => ({ id: sid, name })),
      }));
      return [...teacherContacts, ...adminContacts];
    }

    if (user.roles.includes('teacher')) {
      const [admins, rows] = await Promise.all([
        adminsPromise,
        this.prisma.$queryRaw<
          {
            parent_id: bigint;
            parent_first_name: string;
            parent_last_name: string | null;
            parent_avatar: string | null;
            student_id: bigint;
            student_first_name: string;
            student_last_name: string | null;
          }[]
        >`
          SELECT DISTINCT
            us.user_id AS parent_id,
            u.first_name AS parent_first_name,
            u.last_name AS parent_last_name,
            u.avatar_url AS parent_avatar,
            s.id AS student_id,
            s.first_name AS student_first_name,
            s.last_name AS student_last_name
          FROM classroom_courses cc
          JOIN student_enrollments se ON se.classroom_id = cc.classroom_id AND se.is_active = true
          JOIN students s ON s.id = se.student_id
          JOIN user_students us ON us.student_id = se.student_id
          JOIN users u ON u.id = us.user_id
          WHERE cc.teacher_id = ${user.id}
        `,
      ]);
      const adminContacts = toAdminContacts(admins);

      const byParent = new Map<
        string,
        { name: string; avatar: string | null; students: Map<string, string> }
      >();
      for (const row of rows) {
        const key = row.parent_id.toString();
        if (!byParent.has(key)) {
          byParent.set(key, {
            name: `${row.parent_first_name} ${row.parent_last_name ?? ''}`.trim(),
            avatar: row.parent_avatar,
            students: new Map(),
          });
        }
        byParent.get(key)!.students.set(
          row.student_id.toString(),
          `${row.student_first_name} ${row.student_last_name ?? ''}`.trim(),
        );
      }

      const parentContacts: Contact[] = [...byParent.entries()].map(([id, v]) => ({
        userId: id,
        name: v.name,
        avatar: v.avatar,
        role: 'parent',
        students: [...v.students.entries()].map(([sid, name]) => ({ id: sid, name })),
      }));
      return [...parentContacts, ...adminContacts];
    }

    return toAdminContacts(await adminsPromise);
  }

  // ── Abrir / reutilizar hilo ───────────────────────────────
  async openThread(
    schoolId: bigint,
    sender: { id: bigint; roles: string[] },
    dto: { recipientId: bigint; studentId?: bigint; subject?: string; firstMessageBody: string },
  ) {
    const recipientId = dto.recipientId;
    if (recipientId === sender.id) {
      throw new BadRequestException('No puedes iniciar una conversación contigo mismo');
    }

    const recipient = await this.prisma.user.findFirst({
      where: { id: recipientId, deletedAt: null, userRoles: { some: { schoolId } } },
      select: {
        id: true,
        userRoles: { where: { schoolId }, select: { role: { select: { name: true } } } },
      },
    });
    // NotFoundException, no Forbidden: no se revela si el usuario existe en
    // otro colegio. Mismo criterio que el resto de endpoints multi-tenant.
    if (!recipient) throw new NotFoundException('Destinatario no encontrado');
    const recipientRoles = recipient.userRoles.map((r) => r.role.name);

    const studentId = dto.studentId ?? null;
    await this.assertCanMessage(sender, { id: recipient.id, roles: recipientRoles }, studentId);

    // Reutiliza el hilo si ya existe uno igual (mismo par de personas, mismo
    // alumno) en vez de crear uno nuevo cada vez que el padre escribe.
    const existing = await this.prisma.thread.findFirst({
      where: {
        schoolId,
        kind: 'direct',
        studentId: studentId ?? undefined,
        AND: [
          { participants: { some: { userId: sender.id } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      select: { id: true },
    });

    const threadId = existing
      ? existing.id
      : await this.prisma.$transaction(async (tx) => {
          const t = await tx.thread.create({
            data: {
              schoolId,
              kind: 'direct',
              subject: dto.subject,
              studentId: studentId ?? undefined,
              lastMessageAt: new Date(),
            },
            select: { id: true },
          });
          await tx.threadParticipant.createMany({
            data: [
              { threadId: t.id, userId: sender.id, lastReadAt: new Date() },
              { threadId: t.id, userId: recipientId },
            ],
          });
          return t.id;
        });

    await this.sendMessage(threadId, sender.id, dto.firstMessageBody);
    return { threadId: threadId.toString() };
  }

  // ── Mensajes de un hilo ───────────────────────────────────
  async getMessages(
    threadId: bigint,
    userId: bigint,
    before?: bigint,
    limit = 30,
  ): Promise<{
    messages: ThreadMessageView[];
    otherLastReadAt: Date | null;
    otherLastActiveAt: Date | null;
  }> {
    const [, rows, otherParticipant] = await Promise.all([
      this.assertParticipant(threadId, userId),
      this.prisma.threadMessage.findMany({
        where: {
          threadId,
          deletedAt: null,
          ...(before ? { id: { lt: before } } : {}),
        },
        orderBy: { id: 'desc' },
        take: limit,
        select: {
          id: true,
          senderId: true,
          body: true,
          sentAt: true,
          editedAt: true,
          sender: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.threadParticipant.findFirst({
        where: { threadId, userId: { not: userId } },
        select: { lastReadAt: true, user: { select: { lastActiveAt: true } } },
      }),
    ]);

    // Se pidieron descendente (para el cursor "antes de X"), se devuelven en
    // orden cronológico para pintarlas directo en la pantalla.
    const messages = rows.reverse().map((m) => ({
      id: m.id.toString(),
      senderId: m.senderId.toString(),
      senderName: `${m.sender.firstName} ${m.sender.lastName ?? ''}`.trim(),
      body: m.body,
      sentAt: m.sentAt,
      editedAt: m.editedAt,
    }));

    return {
      messages,
      otherLastReadAt: otherParticipant?.lastReadAt ?? null,
      otherLastActiveAt: otherParticipant?.user?.lastActiveAt ?? null,
    };
  }

  private static readonly MENTION_RE = /@\[(.*?)\]\((homework|gc-coursework):(\d+)\)/g;

  private stripMentions(body: string): string {
    return body.replace(ThreadsService.MENTION_RE, '📋 $1');
  }

  async searchMentions(threadId: bigint, userId: bigint, query: string) {
    const thread = await this.assertParticipant(threadId, userId);
    const q = query.trim();

    const [institutional, classroom] = await Promise.all([
      this.searchInstitutionalHomework(thread.studentId, q),
      this.searchClassroomCoursework(thread.studentId, q),
    ]);

    return [...institutional, ...classroom]
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
      .slice(0, 8);
  }

  private async searchInstitutionalHomework(studentId: bigint | null, q: string) {
    const classroomId = await this.classroomOfThread(studentId);
    if (!classroomId) return [];

    const homeworks = await this.prisma.homework.findMany({
      where: {
        classroomId,
        deletedAt: null,
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { dueDate: 'asc' },
      take: 8,
      select: { id: true, title: true, dueDate: true, course: { select: { name: true } } },
    });

    return homeworks.map((h) => ({
      id: h.id.toString(),
      type: 'homework' as const,
      title: h.title,
      dueDate: h.dueDate,
      courseName: h.course.name,
    }));
  }

  private async searchClassroomCoursework(studentId: bigint | null, q: string) {
    if (!studentId) return [];

    const courseworks = await this.prisma.gcCoursework.findMany({
      where: {
        course: { studentId },
        state: 'PUBLISHED',
        workType: { not: 'MATERIAL' },
        ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { dueDate: 'asc' },
      take: 8,
      select: { id: true, title: true, dueDate: true, course: { select: { name: true } } },
    });

    return courseworks.map((cw) => ({
      id: cw.id.toString(),
      type: 'gc-coursework' as const,
      title: cw.title,
      dueDate: cw.dueDate,
      courseName: cw.course.name,
    }));
  }

  async getClassroomTaskLink(threadId: bigint, userId: bigint, refId: bigint) {
    const thread = await this.assertParticipant(threadId, userId);
    if (!thread.studentId) throw new NotFoundException('Tarea no encontrada');

    const coursework = await this.prisma.gcCoursework.findFirst({
      where: { id: refId, course: { studentId: thread.studentId } },
      select: { alternateLink: true },
    });
    if (!coursework) throw new NotFoundException('Tarea no encontrada');
    return { alternateLink: coursework.alternateLink };
  }

  async sendMessage(threadId: bigint, userId: bigint, body: string) {
    const thread = await this.assertParticipant(threadId, userId);
    if (thread.closedAt) {
      throw new BadRequestException('Esta conversación está cerrada');
    }

    const mentions = [...body.matchAll(ThreadsService.MENTION_RE)];
    const homeworkIds = mentions.filter((m) => m[2] === 'homework').map((m) => BigInt(m[3]));
    const classroomTaskIds = mentions
      .filter((m) => m[2] === 'gc-coursework')
      .map((m) => BigInt(m[3]));

    if (homeworkIds.length > 0) {
      const classroomId = await this.classroomOfThread(thread.studentId);
      const validCount = classroomId
        ? await this.prisma.homework.count({
            where: { id: { in: homeworkIds }, classroomId, deletedAt: null },
          })
        : 0;
      if (validCount !== new Set(homeworkIds.map((id) => id.toString())).size) {
        throw new BadRequestException('Una tarea mencionada no pertenece a esta conversación');
      }
    }
    if (classroomTaskIds.length > 0) {
      const validCount = thread.studentId
        ? await this.prisma.gcCoursework.count({
            where: { id: { in: classroomTaskIds }, course: { studentId: thread.studentId } },
          })
        : 0;
      if (validCount !== new Set(classroomTaskIds.map((id) => id.toString())).size) {
        throw new BadRequestException('Una tarea mencionada no pertenece a esta conversación');
      }
    }

    const [result] = await this.prisma.$queryRaw<{ id: string; sent_at: Date }[]>`
      WITH new_message AS (
        INSERT INTO thread_messages (thread_id, sender_id, body, sent_at)
        VALUES (${threadId}, ${userId}, ${body}, now())
        RETURNING id, sent_at
      ),
      thread_update AS (
        UPDATE threads SET last_message_at = now() WHERE id = ${threadId}
      )
      -- Quien escribe da por leído su propio mensaje: sin esto, el hilo le
      -- aparecería a él mismo como "sin leer" justo después de enviarlo.
      UPDATE thread_participants
      SET last_read_at = now()
      WHERE thread_id = ${threadId} AND user_id = ${userId}
      RETURNING
        (SELECT id::text FROM new_message) AS id,
        (SELECT sent_at FROM new_message) AS sent_at
    `;
    const message = { id: result.id, sentAt: result.sent_at };

    this.notifyOthers(threadId, userId, body).catch(() => {});

    return { id: message.id, sentAt: message.sentAt };
  }

  private async notifyOthers(threadId: bigint, senderId: bigint, body: string) {
    const others = await this.prisma.threadParticipant.findMany({
      where: { threadId, userId: { not: senderId }, mutedAt: null },
      select: { userId: true },
    });
    if (others.length === 0) return;

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { firstName: true, lastName: true },
    });
    const title = `${sender?.firstName ?? 'Alguien'} te escribió`;
    const cleanBody = this.stripMentions(body);
    const preview = cleanBody.length > 120 ? `${cleanBody.slice(0, 117)}…` : cleanBody;
    for (const p of others) {
      this.notifications
        .sendToUser(p.userId, title, preview, {
          screen: 'thread',
          threadId: threadId.toString(),
          refresh: 'true',
        })
        .catch(() => {});
    }
  }

  async markRead(threadId: bigint, userId: bigint) {
    await this.assertParticipant(threadId, userId);
    await this.prisma.threadParticipant.update({
      where: { threadId_userId: { threadId, userId } },
      data: { lastReadAt: new Date() },
    });
    this.notifyReadReceipt(threadId, userId).catch(() => {});
    return { ok: true };
  }

  private async notifyReadReceipt(threadId: bigint, readerId: bigint) {
    const others = await this.prisma.threadParticipant.findMany({
      where: { threadId, userId: { not: readerId } },
      select: { userId: true },
    });
    await Promise.all(
      others.map((p) =>
        this.notifications.sendSilentRefresh(p.userId, {
          screen: 'thread',
          threadId: threadId.toString(),
          refresh: 'true',
        }),
      ),
    );
  }

  async setMuted(threadId: bigint, userId: bigint, muted: boolean) {
    await this.assertParticipant(threadId, userId);
    await this.prisma.threadParticipant.update({
      where: { threadId_userId: { threadId, userId } },
      data: { mutedAt: muted ? new Date() : null },
    });
    return { ok: true };
  }

  // ── Helpers de autorización ───────────────────────────────

  private async assertParticipant(threadId: bigint, userId: bigint) {
    const participant = await this.prisma.threadParticipant.findUnique({
      where: { threadId_userId: { threadId, userId } },
      select: { thread: { select: { closedAt: true, studentId: true } } },
    });
    if (!participant) {
      throw new NotFoundException('Conversación no encontrada');
    }
    return participant.thread;
  }

  private async classroomOfThread(studentId: bigint | null): Promise<bigint | null> {
    if (!studentId) return null;
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId, isActive: true },
      select: { classroomId: true },
    });
    return enrollment?.classroomId ?? null;
  }

  private async assertCanMessage(
    sender: { id: bigint; roles: string[] },
    recipient: { id: bigint; roles: string[] },
    studentId: bigint | null,
  ) {
    if (isAdmin(sender.roles) || isAdmin(recipient.roles)) {
      return;
    }

    if (!studentId) {
      throw new BadRequestException(
        'Indica de qué alumno se trata esta conversación',
      );
    }

    const senderIsParent = sender.roles.includes('parent');
    const senderIsTeacher = sender.roles.includes('teacher');
    const recipientIsParent = recipient.roles.includes('parent');
    const recipientIsTeacher = recipient.roles.includes('teacher');

    let parentId: bigint;
    let teacherId: bigint;
    if (senderIsParent && recipientIsTeacher) {
      parentId = sender.id;
      teacherId = recipient.id;
    } else if (senderIsTeacher && recipientIsParent) {
      parentId = recipient.id;
      teacherId = sender.id;
    } else {
      throw new ForbiddenException('No puedes iniciar esta conversación');
    }

    // Ninguna de las dos depende del resultado de la otra — corren en
    // paralelo en vez de una tras otra.
    const [ownsStudent, teaches] = await Promise.all([
      this.prisma.userStudent.findFirst({
        where: { userId: parentId, studentId },
        select: { id: true },
      }),
      // El docente debe dictar en un aula donde el alumno esté matriculado.
      this.prisma.classroomCourse.findFirst({
        where: {
          teacherId,
          classroom: {
            enrollments: { some: { studentId, isActive: true } },
          },
        },
        select: { id: true },
      }),
    ]);
    if (!ownsStudent) {
      throw new ForbiddenException('No tienes acceso a este alumno');
    }
    if (!teaches) {
      throw new ForbiddenException('Ese docente no enseña a este alumno');
    }
  }
}
