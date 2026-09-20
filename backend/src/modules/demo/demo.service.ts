import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_PASSWORD,
  DEMO_SCHOOL_EMAIL,
} from '../../common/utils/demo-account';

type Tx = Prisma.TransactionClient;

type DemoBase = {
  schoolId: bigint;
  teacherId: bigint;
  parent1Id: bigint;
  parent2Id: bigint;
  students: { id: bigint; firstName: string; lastName: string; gcStudentId: bigint }[];
};

const limaDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dueAt = (day: string, n: number) => new Date(`${addDays(day, n)}T23:59:00-05:00`);
const timeOf = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

const DEMO_COURSES = [
  {
    name: 'Matemática',
    items: [
      { title: 'Ficha de sumas y restas', due: 0, state: 'CREATED', grade: null },
      { title: 'Problemas con monedas', due: 2, state: 'CREATED', grade: null },
      { title: 'Práctica de tablas del 2 y 3', due: -3, state: 'TURNED_IN', grade: null },
    ],
  },
  {
    name: 'Comunicación',
    items: [
      { title: 'Lectura: El zorro y el cuervo', due: 1, state: 'CREATED', grade: null },
      { title: 'Dictado de palabras', due: -2, state: 'CREATED', grade: 18 },
    ],
  },
  {
    name: 'Ciencia y Tecnología',
    items: [
      { title: 'Experimento: germinación de una semilla', due: 3, state: 'CREATED', grade: null },
      { title: 'Dibujo del ciclo del agua', due: -5, state: 'TURNED_IN', grade: null },
    ],
  },
];

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private inFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  ensureFresh(force = false): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.run(force).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  // El login no debe fallar ni colgarse por el reinicio: espera un máximo y
  // sigue; si el reinicio termina después, lo verá el siguiente refresh.
  async ensureFreshWithin(maxMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxMs);
    });
    try {
      await Promise.race([this.ensureFresh().catch(() => undefined), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async run(force: boolean): Promise<void> {
    const today = limaDay();
    const school = await this.prisma.school.findFirst({
      where: { email: DEMO_SCHOOL_EMAIL },
      select: { metadata: true },
    });
    const markedDay = (school?.metadata as { demoResetDay?: string } | null)?.demoResetDay;
    if (!force && markedDay === today) return;

    try {
      await this.prisma.$transaction((tx) => this.build(tx, today), {
        timeout: 90_000,
        maxWait: 10_000,
      });
      this.logger.log(`Colegio demo listo para ${today}`);
    } catch (e) {
      this.logger.error(`No se pudo preparar el colegio demo: ${(e as Error).message}`);
      throw e;
    }
  }

  private async build(tx: Tx, today: string): Promise<void> {
    const school = await tx.school.findFirst({ where: { email: DEMO_SCHOOL_EMAIL } });
    const base = school ? await this.loadBase(tx, school.id) : await this.createBase(tx, today);
    await this.resetDaily(tx, base, today);
    await tx.school.update({
      where: { id: base.schoolId },
      data: { metadata: { demoResetDay: today } },
    });
  }

  private async syncSequences(tx: Tx): Promise<void> {
    for (const table of ['schools', 'school_locations', 'classrooms', 'courses', 'students']) {
      await tx.$queryRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT MAX(id) FROM ${table}) IS NOT NULL)`,
      );
    }
  }

  private async loadBase(tx: Tx, schoolId: bigint): Promise<DemoBase> {
    const [users, students] = await Promise.all([
      tx.user.findMany({
        where: { email: { in: ['docente', 'padre', 'padre2'].map((u) => `${u}${DEMO_EMAIL_DOMAIN}`) } },
        select: { id: true, email: true },
      }),
      tx.student.findMany({
        where: { schoolId },
        orderBy: { id: 'asc' },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const gcStudents = await tx.gcCourseStudent.findMany({
      where: { studentId: { in: students.map((s) => s.id) } },
      select: { id: true, studentId: true },
    });
    const idOf = (name: string) => users.find((u) => u.email === `${name}${DEMO_EMAIL_DOMAIN}`)?.id;
    const teacherId = idOf('docente');
    const parent1Id = idOf('padre');
    const parent2Id = idOf('padre2');
    const linked = students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName ?? '',
      gcStudentId: gcStudents.find((g) => g.studentId === s.id)?.id,
    }));
    if (
      !teacherId ||
      !parent1Id ||
      !parent2Id ||
      linked.length !== 3 ||
      linked.some((s) => !s.gcStudentId)
    ) {
      throw new Error('La base del colegio demo está incompleta y hay que recrearla');
    }
    return {
      schoolId,
      teacherId,
      parent1Id,
      parent2Id,
      students: linked.map((s) => ({ ...s, gcStudentId: s.gcStudentId as bigint })),
    };
  }

  private async createBase(tx: Tx, today: string): Promise<DemoBase> {
    const year = Number(today.slice(0, 4));
    await this.syncSequences(tx);
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const school = await tx.school.create({
      data: {
        name: 'Colegio Demo Kolexa',
        tradeName: 'Demo',
        email: DEMO_SCHOOL_EMAIL,
        address: 'Lima, Perú (datos ficticios)',
        metadata: {},
      },
    });

    const mkUser = (email: string, firstName: string, lastName: string) =>
      tx.user.create({
        data: { email: `${email}${DEMO_EMAIL_DOMAIN}`, passwordHash: hash, firstName, lastName, isActive: true },
      });
    const admin = await mkUser('admin', 'Carmen', 'Salazar Díaz');
    const teacher = await mkUser('docente', 'Daniela', 'Paredes Luna');
    const parent1 = await mkUser('padre', 'Patricia', 'Vega Ruiz');
    const parent2 = await mkUser('padre2', 'Andrés', 'Soto Mena');

    const roles = await Promise.all(
      ['school_admin', 'teacher', 'parent'].map((name) =>
        tx.role.upsert({ where: { name }, update: {}, create: { name } }),
      ),
    );
    const [roleAdmin, roleTeacher, roleParent] = roles;
    await tx.userRole.createMany({
      data: [
        { userId: admin.id, roleId: roleAdmin.id, schoolId: school.id },
        { userId: teacher.id, roleId: roleTeacher.id, schoolId: school.id },
        { userId: parent1.id, roleId: roleParent.id, schoolId: school.id },
        { userId: parent2.id, roleId: roleParent.id, schoolId: school.id },
      ],
    });

    const location = await tx.schoolLocation.create({
      data: { schoolId: school.id, name: 'Sede Principal', address: 'Lima, Perú' },
    });
    const classroom = await tx.classroom.create({
      data: { schoolLocationId: location.id, name: '3ro A', grade: '3ro', section: 'A', academicYear: year },
    });

    const classroomCourses: { id: bigint }[] = [];
    for (const [i, c] of DEMO_COURSES.entries()) {
      const course = await tx.course.create({
        data: { schoolId: school.id, name: c.name, code: `DEMO${i + 1}` },
      });
      classroomCourses.push(
        await tx.classroomCourse.create({
          data: { classroomId: classroom.id, courseId: course.id, teacherId: teacher.id },
          select: { id: true },
        }),
      );
    }

    const studentSeeds = [
      { firstName: 'Mateo', lastName: 'Rojas Vega', sex: 'M', parent: parent1.id, rel: 'madre' },
      { firstName: 'Valeria', lastName: 'Rojas Vega', sex: 'F', parent: parent1.id, rel: 'madre' },
      { firstName: 'Camila', lastName: 'Soto Ruiz', sex: 'F', parent: parent2.id, rel: 'padre' },
    ];
    const students: { id: bigint; firstName: string; lastName: string }[] = [];
    for (const [i, s] of studentSeeds.entries()) {
      const student = await tx.student.create({
        data: {
          schoolId: school.id,
          firstName: s.firstName,
          lastName: s.lastName,
          code: `DEMO-00${i + 1}`,
          sex: s.sex,
          birthday: new Date(`${year - 8}-0${i + 3}-15`),
        },
      });
      await tx.studentEnrollment.create({
        data: { studentId: student.id, classroomId: classroom.id, academicYear: year, isActive: true },
      });
      await tx.userStudent.create({
        data: { userId: s.parent, studentId: student.id, relationship: s.rel, isPrimary: true },
      });
      students.push({ id: student.id, firstName: s.firstName, lastName: s.lastName });
    }

    const gcCourse = await tx.gcTeacherCourse.create({
      data: {
        teacherId: teacher.id,
        googleId: 'demo-tc-1',
        name: '3ro A - Primaria',
        section: 'A',
        studentCount: students.length,
        students: {
          create: students.map((s, i) => ({
            googleId: `demo-gs-${i + 1}`,
            fullName: `${s.firstName} ${s.lastName}`,
            email: `alumno${i + 1}${DEMO_EMAIL_DOMAIN}`,
            studentId: s.id,
          })),
        },
      },
      include: { students: { select: { id: true, studentId: true } } },
    });

    const farFuture = new Date('2036-01-01T00:00:00Z');
    await tx.teacherGoogleToken.create({
      data: {
        userId: teacher.id,
        accessToken: 'demo',
        refreshToken: 'demo',
        expiresAt: farFuture,
        scope: 'demo',
        googleEmail: `docente${DEMO_EMAIL_DOMAIN}`,
      },
    });
    await tx.googleToken.createMany({
      data: students.map((s, i) => ({
        studentId: s.id,
        accessToken: 'demo',
        refreshToken: 'demo',
        expiresAt: farFuture,
        scope: 'demo',
        googleEmail: `alumno${i + 1}${DEMO_EMAIL_DOMAIN}`,
      })),
    });

    const schedule: Prisma.ScheduleBlockCreateManyInput[] = [];
    for (let day = 1; day <= 5; day++) {
      const at = (start: string, end: string, extra: Partial<Prisma.ScheduleBlockCreateManyInput>) =>
        schedule.push({
          classroomId: classroom.id,
          dayOfWeek: day,
          startTime: timeOf(start),
          endTime: timeOf(end),
          type: 'class',
          ...extra,
        });
      at('08:00', '09:00', { classroomCourseId: classroomCourses[0].id });
      at('09:00', '10:00', { classroomCourseId: classroomCourses[1].id });
      at('10:00', '10:30', { type: 'recess', label: 'Recreo' });
      at('10:30', '11:30', { classroomCourseId: classroomCourses[2].id });
      at('11:30', '12:15', { type: 'activity', label: 'Tutoría' });
    }
    await tx.scheduleBlock.createMany({ data: schedule });

    return {
      schoolId: school.id,
      teacherId: teacher.id,
      parent1Id: parent1.id,
      parent2Id: parent2.id,
      students: students.map((s) => ({
        ...s,
        gcStudentId: gcCourse.students.find((g) => g.studentId === s.id)!.id,
      })),
    };
  }

  private async resetDaily(tx: Tx, base: DemoBase, today: string): Promise<void> {
    const studentIds = base.students.map((s) => s.id);
    await tx.thread.deleteMany({ where: { schoolId: base.schoolId } });
    await tx.gcAttendanceSession.deleteMany({ where: { teacherId: base.teacherId } });
    await tx.gcCourse.deleteMany({ where: { studentId: { in: studentIds } } });

    const statuses = ['present', 'late', 'present'];
    await tx.gcAttendanceSession.create({
      data: {
        teacherId: base.teacherId,
        date: new Date(today),
        createdAt: new Date(`${today}T07:55:00-05:00`),
        photoUrls: [],
        records: {
          create: base.students.map((s, i) => ({ studentId: s.gcStudentId, status: statuses[i] })),
        },
      },
    });

    const courseValues = base.students.flatMap((s) =>
      DEMO_COURSES.map(
        (c, ci) =>
          Prisma.sql`(${s.id}, ${`demo-gc-${s.id}-${ci}`}, ${c.name}, ${'A'}, ${'Prof. Daniela Paredes'}, NOW())`,
      ),
    );
    const courseRows = await tx.$queryRaw<{ id: bigint; student_id: bigint; google_id: string }[]>`
      INSERT INTO gc_courses (student_id, google_id, name, section, teacher_name, synced_at)
      VALUES ${Prisma.join(courseValues)}
      RETURNING id, student_id, google_id
    `;

    const cwSeeds: { courseId: bigint; googleId: string; item: (typeof DEMO_COURSES)[0]['items'][0] }[] = [];
    for (const row of courseRows) {
      const ci = Number(row.google_id.split('-').pop());
      DEMO_COURSES[ci].items.forEach((item, ii) =>
        cwSeeds.push({ courseId: row.id, googleId: `demo-cw-${row.id}-${ii}`, item }),
      );
    }
    const cwValues = cwSeeds.map(
      (c) =>
        Prisma.sql`(${c.courseId}, ${c.googleId}, ${c.item.title}, ${'Actividad de demostración'}, ${dueAt(today, c.item.due)}, ${20}, ${'ASSIGNMENT'}, ${'PUBLISHED'}, NOW())`,
    );
    const cwRows = await tx.$queryRaw<{ id: bigint; google_id: string }[]>`
      INSERT INTO gc_coursework (course_id, google_id, title, description, due_date, max_points, work_type, state, synced_at)
      VALUES ${Prisma.join(cwValues)}
      RETURNING id, google_id
    `;

    const subValues = cwSeeds.map((c) => {
      const cwId = cwRows.find((r) => r.google_id === c.googleId)!.id;
      return Prisma.sql`(${cwId}, ${`demo-sub-${c.googleId}`}, ${c.item.state}, ${c.item.grade}, NOW())`;
    });
    await tx.$executeRaw`
      INSERT INTO gc_student_submissions (coursework_id, google_id, submission_state, assigned_grade, synced_at)
      VALUES ${Prisma.join(subValues)}
    `;

    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
    const [mateo, , camila] = base.students;
    await tx.thread.create({
      data: {
        schoolId: base.schoolId,
        kind: 'direct',
        subject: `Seguimiento de ${mateo.firstName}`,
        studentId: mateo.id,
        lastMessageAt: ago(60),
        participants: {
          create: [
            { userId: base.parent1Id, lastReadAt: ago(150) },
            { userId: base.teacherId, lastReadAt: ago(60) },
          ],
        },
        messages: {
          create: [
            { senderId: base.teacherId, sentAt: ago(180), body: 'Buenos días, Mateo participó muy bien hoy en la clase de Matemática.' },
            { senderId: base.parent1Id, sentAt: ago(150), body: '¡Gracias, profesora! Estamos practicando las sumas en casa.' },
            { senderId: base.teacherId, sentAt: ago(60), body: 'Excelente. Recuerden traer el material de Ciencia y Tecnología mañana.' },
          ],
        },
      },
    });
    await tx.thread.create({
      data: {
        schoolId: base.schoolId,
        kind: 'direct',
        subject: `Consulta sobre ${camila.firstName}`,
        studentId: camila.id,
        lastMessageAt: ago(30),
        participants: {
          create: [
            { userId: base.parent2Id, lastReadAt: ago(30) },
            { userId: base.teacherId, lastReadAt: ago(300) },
          ],
        },
        messages: {
          create: [
            { senderId: base.parent2Id, sentAt: ago(30), body: 'Buenas tardes, ¿Camila necesita algún material adicional para la semana?' },
          ],
        },
      },
    });
  }
}
