// anecdotes.service.ts — Anécdotas del alumno

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPayload } from '../../common/decorators/current-user.decorator';
import { isSchoolAdminOf } from '../../common/utils/school-staff-access';

@Injectable()
export class AnecdotesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── isTeacherOfStudent ────────────────────────────────────
  private async isTeacherOfStudent(teacherId: bigint, studentId: number): Promise<boolean> {
    const currentYear = new Date().getFullYear();
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId, academicYear: currentYear, isActive: true },
      select: { classroomId: true },
    });
    if (!enrollment) return false;

    const teaches = await this.prisma.classroomCourse.findFirst({
      where: { classroomId: enrollment.classroomId, teacherId },
      select: { id: true },
    });
    return !!teaches;
  }

  // ── create ────────────────────────────────────────────────
  async create(
    data: {
      studentId: number;
      title: string;
      description: string;
      category?: string; // 'behavior', 'academic', 'social', 'health'
      isPrivate?: boolean; // si es privada, el padre no la ve
      date?: string;
    },
    teacherId: bigint,
  ) {
    // `isTeacherOfStudent` no usa nada del `student` recién buscado, solo
    // los ids de entrada — corren en paralelo.
    const [student, authorized] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: data.studentId, deletedAt: null },
      }),
      this.isTeacherOfStudent(teacherId, data.studentId),
    ]);
    if (!student) throw new NotFoundException('Alumno no encontrado');
    if (!authorized) {
      throw new ForbiddenException('No dictas clases a este alumno');
    }

    return this.prisma.anecdote.create({
      data: {
        studentId: data.studentId,
        authorId: teacherId,
        title: data.title,
        description: data.description,
        category: data.category ?? 'general',
        isPrivate: data.isPrivate ?? false,
        occurredAt: data.date ? new Date(data.date) : new Date(),
      },
      include: {
        author: { select: { firstName: true, lastName: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
  }

  // ── getForStudent ─────────────────────────────────────────
  async getForStudent(studentId: number, user: UserPayload, isTeacher: boolean) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    if (!student) throw new NotFoundException('Alumno no encontrado');

    const isAdmin = isSchoolAdminOf(user, student.schoolId);
    const requesterId = user.sub;

    if (isAdmin) {
      // sin chequeo de relación — acceso concedido
    } else if (isTeacher) {
      const authorized = await this.isTeacherOfStudent(requesterId, studentId);
      if (!authorized) {
        throw new ForbiddenException('No tienes acceso a las anécdotas de este alumno');
      }
    } else {
      // Verificar que es el padre del alumno
      const rel = await this.prisma.userStudent.findFirst({
        where: { userId: requesterId, studentId },
      });
      if (!rel) throw new ForbiddenException('No tienes acceso a las anécdotas de este alumno');
    }

    return this.prisma.anecdote.findMany({
      where: {
        studentId,
        deletedAt: null,
        // Los padres solo ven anécdotas no privadas (docentes y el director sí las ven)
        ...(!isTeacher && !isAdmin && { isPrivate: false }),
      },
      include: {
        author: { select: { firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  // ── delete ────────────────────────────────────────────────
  async delete(anecdoteId: number, teacherId: bigint) {
    const anecdote = await this.prisma.anecdote.findUnique({
      where: { id: anecdoteId, deletedAt: null },
    });
    if (!anecdote) throw new NotFoundException('Anécdota no encontrada');
    if (anecdote.authorId !== teacherId) {
      throw new ForbiddenException('Solo el autor puede eliminar esta anécdota');
    }

    return this.prisma.anecdote.update({
      where: { id: anecdoteId },
      data: { deletedAt: new Date() },
    });
  }
}
