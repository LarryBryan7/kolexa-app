// attendance.service.ts — Lógica de negocio de Asistencia

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceRecordsDto } from './dto/update-records.dto';

@Injectable() // @Injectable permite que NestJS inyecte este servicio en el Controller
export class AttendanceService {
  // PrismaService se inyecta automáticamente gracias al constructor
  // (Dependency Injection de NestJS)
  constructor(private readonly prisma: PrismaService) {}

  // ── createSession ─────────────────────────────────────────
  async createSession(dto: CreateAttendanceDto, teacherId: bigint) {
    // Verificar que el aula existe
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: dto.classroomId },
    });
    if (!classroom) {
      throw new NotFoundException(`Aula con ID ${dto.classroomId} no encontrada`);
    }

    // Verificar que no existe ya una sesión para ese aula y fecha
    // (no puede haber dos sesiones de asistencia el mismo día para el mismo aula)
    const dateObj = new Date(dto.date);
    const existing = await this.prisma.attendance.findFirst({
      where: {
        classroomId: dto.classroomId,
        // Buscar por día completo: desde inicio hasta fin del día
        date: {
          gte: new Date(dateObj.setHours(0, 0, 0, 0)),
          lte: new Date(dateObj.setHours(23, 59, 59, 999)),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una sesión de asistencia para esta aula el ${dto.date}`,
      );
    }

    // Obtener todos los alumnos matriculados en el aula para el año actual
    // (usamos student_enrollments para soportar múltiples años académicos)
    const currentYear = new Date().getFullYear();
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classroomId: dto.classroomId,
        academicYear: currentYear,
        isActive: true,
      },
      include: {
        student: true, // traer los datos del alumno
      },
    });

    const session = await this.prisma.$transaction(async (tx) => {
      // 1. Crear la sesión principal
      const newSession = await tx.attendance.create({
        data: {
          classroomId: dto.classroomId,
          courseId: dto.courseId,
          teacherId,
          date: new Date(dto.date),
          notes: dto.notes,
        },
      });

      if (enrollments.length > 0) {
        await tx.attendanceRecord.createMany({
          data: enrollments.map((enrollment) => ({
            attendanceId: newSession.id,
            studentId: enrollment.studentId,
            status: 'present', // estado por defecto: presente
          })),
        });
      }

      return newSession;
    });

    // Retornar la sesión con los registros ya creados
    return this.getSession(session.id);
  }

  // ── getSession ────────────────────────────────────────────
  // Obtiene una sesión de asistencia con todos sus registros de alumnos.
  async getSession(sessionId: bigint) {
    const session = await this.prisma.attendance.findUnique({
      where: { id: sessionId },
      include: {
        classroom: {
          select: { id: true, name: true, grade: true, section: true },
        },
        course: {
          select: { id: true, name: true },
        },
        teacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        // Incluir los registros con los datos del alumno
        records: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                code: true,
                avatar: true,
              },
            },
          },
          // Ordenar por apellido para que la lista sea consistente
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Sesión de asistencia ${sessionId} no encontrada`);
    }

    return session;
  }

  // ── getByClassroom ────────────────────────────────────────
  // Obtiene la sesión de un aula en una fecha específica.
  // Lo usa el profesor al abrir la pantalla de asistencia del día.
  async getByClassroom(classroomId: number, date: string) {
    const dateObj = new Date(date);

    const session = await this.prisma.attendance.findFirst({
      where: {
        classroomId,
        date: {
          gte: new Date(dateObj.setHours(0, 0, 0, 0)),
          lte: new Date(dateObj.setHours(23, 59, 59, 999)),
        },
      },
      include: {
        records: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                code: true,
                avatar: true,
              },
            },
          },
          orderBy: [
            { student: { lastName: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    });

    // Retornar null si no existe (el frontend crea la sesión si no hay una)
    return session;
  }

  // ── updateRecords ─────────────────────────────────────────
  async updateRecords(
    sessionId: bigint,
    dto: UpdateAttendanceRecordsDto,
    userId: bigint,
  ) {
    // Verificar que la sesión existe
    const session = await this.prisma.attendance.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    }

    // Solo el profesor que creó la sesión puede modificarla
    if (session.teacherId !== userId) {
      throw new ForbiddenException(
        'Solo el profesor que creó esta sesión puede modificarla',
      );
    }

    // Actualizar cada registro en paralelo con Promise.all
    // (más rápido que hacerlo uno por uno en un loop)
    await Promise.all(
      dto.records.map((record) =>
        this.prisma.attendanceRecord.upsert({
          where: {
            // El índice único en la DB garantiza un registro por alumno por sesión
            attendanceId_studentId: {
              attendanceId: sessionId,
              studentId: record.studentId,
            },
          },
          update: {
            status: record.status,
            lateMinutes: record.lateMinutes,
            justification: record.justification,
          },
          create: {
            attendanceId: sessionId,
            studentId: record.studentId,
            status: record.status,
            lateMinutes: record.lateMinutes,
            justification: record.justification,
          },
        }),
      ),
    );

    // Retornar la sesión actualizada
    return this.getSession(sessionId);
  }

  // ── getStudentHistory ─────────────────────────────────────
  async getStudentHistory(
    studentId: number,
    userId: bigint,
    limit = 30,
    offset = 0,
  ) {
    // Verificar que el usuario es padre/tutor de este alumno
    const relationship = await this.prisma.userStudent.findFirst({
      where: { userId, studentId },
    });
    if (!relationship) {
      throw new ForbiddenException('No tienes acceso al historial de este alumno');
    }

    // Obtener el historial ordenado por fecha descendente (más reciente primero)
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      include: {
        attendance: {
          include: {
            classroom: {
              select: { name: true, grade: true, section: true },
            },
            course: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { attendance: { date: 'desc' } },
      take: limit,
      skip: offset,
    });

    // Contar el total para la paginación
    const total = await this.prisma.attendanceRecord.count({
      where: { studentId },
    });

    // Calcular estadísticas de asistencia
    const stats = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { studentId },
      _count: { status: true },
    });

    return { records, total, stats };
  }
}
