// payments.service.ts — Control de pagos escolares

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPayload } from '../../common/decorators/current-user.decorator';
import { isSchoolAdminOf } from '../../common/utils/school-staff-access';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── createConcept ─────────────────────────────────────────
  // La administración del colegio crea un concepto de pago.
  // Ej: "Matrícula 2024" (monto fijo), "Pensión Abril" (mensual).
  async createConcept(
    data: {
      name: string;
      description?: string;
      amount: number;        // monto en centavos para evitar problemas de decimales
      currency: string;      // 'PEN', 'USD', etc.
      dueDate?: string;      // fecha límite de pago
      schoolId: bigint;
    },
    userId: bigint,
  ) {
    return this.prisma.paymentConcept.create({
      data: {
        name: data.name,
        description: data.description,
        amount: data.amount,
        currency: data.currency ?? 'PEN',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        schoolId: data.schoolId,
        createdBy: userId,
      },
    });
  }

  // ── assignObligations ────────────────────────────────────
  async assignObligations(
    data: {
      conceptId: number;
      studentIds: number[];
      dueDate?: string;
    },
    schoolId: bigint,
    userId: bigint,
  ) {
    const concept = await this.prisma.paymentConcept.findUnique({
      where: { id: data.conceptId },
    });
    if (!concept) throw new NotFoundException('Concepto de pago no encontrado');
    if (concept.schoolId !== schoolId) {
      throw new ForbiddenException('Este concepto de pago no pertenece a tu colegio');
    }

    const students = await this.prisma.student.findMany({
      where: { id: { in: data.studentIds } },
      select: { id: true, schoolId: true },
    });
    const belongsToAnotherSchool = students.some((s) => s.schoolId !== schoolId);
    if (belongsToAnotherSchool || students.length !== data.studentIds.length) {
      throw new ForbiddenException('Uno o más alumnos no pertenecen a tu colegio');
    }

    // Crear obligaciones para cada alumno (ignorar duplicados)
    const result = await this.prisma.paymentObligation.createMany({
      data: data.studentIds.map((studentId) => ({
        studentId,
        conceptId: data.conceptId,
        amount: concept.amount,
        currency: concept.currency,
        dueDate: data.dueDate ? new Date(data.dueDate) : concept.dueDate,
        status: 'pending',
        assignedBy: userId,
      })),
      skipDuplicates: true,
    });

    return { created: result.count };
  }

  // ── recordPayment ─────────────────────────────────────────
  async recordPayment(
    data: {
      obligationId: number;
      amountPaid: number;
      paymentMethod: string; // 'cash', 'transfer', 'card', 'online'
      reference?: string;    // número de operación/voucher
      notes?: string;
    },
    schoolId: bigint,
    staffId: bigint,
  ) {
    const obligation = await this.prisma.paymentObligation.findUnique({
      where: { id: data.obligationId },
      include: { student: { select: { schoolId: true } } },
    });
    if (!obligation) throw new NotFoundException('Obligación de pago no encontrada');
    if (obligation.student.schoolId !== schoolId) {
      throw new ForbiddenException('Esta obligación no pertenece a tu colegio');
    }
    if (obligation.status === 'paid') {
      throw new ConflictException('Esta obligación ya fue pagada');
    }

    // Registrar el pago y actualizar el estado de la obligación en transacción
    const payment = await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          obligationId: data.obligationId,
          amountPaid: data.amountPaid,
          paymentMethod: data.paymentMethod,
          reference: data.reference,
          notes: data.notes,
          paidAt: new Date(),
          receivedBy: staffId,
        },
      });

      // Marcar la obligación como pagada si el monto es suficiente
      const isPaid = data.amountPaid >= Number(obligation.amount);
      await tx.paymentObligation.update({
        where: { id: data.obligationId },
        data: {
          status: isPaid ? 'paid' : 'partial',
          paidAt: isPaid ? new Date() : null,
        },
      });

      return newPayment;
    });

    return payment;
  }

  // ── getStudentObligations ─────────────────────────────────
  // Estado financiero de un alumno: qué debe, qué pagó.
  // Lo ve el padre, o el director (school_admin) del mismo colegio.
  async getStudentObligations(studentId: number, user: UserPayload) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!student) throw new NotFoundException('Alumno no encontrado');

    if (!isSchoolAdminOf(user, student.schoolId)) {
      const rel = await this.prisma.userStudent.findFirst({
        where: { userId: user.sub, studentId },
      });
      if (!rel) throw new ForbiddenException('No tienes acceso a los pagos de este alumno');
    }

    const obligations = await this.prisma.paymentObligation.findMany({
      where: { studentId },
      include: {
        concept: { select: { name: true, description: true } },
        payments: {
          select: { amountPaid: true, paidAt: true, paymentMethod: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Totales para el resumen financiero
    const totalOwed = obligations
      .filter((o) => o.status !== 'paid')
      .reduce((sum, o) => sum + Number(o.amount), 0);

    const totalPaid = obligations
      .filter((o) => o.status === 'paid')
      .reduce((sum, o) => sum + Number(o.amount), 0);

    return { obligations, totalOwed, totalPaid };
  }

  // ── getConcepts ───────────────────────────────────────────
  // Lista de conceptos de pago de una escuela.
  async getConcepts(schoolId: bigint) {
    return this.prisma.paymentConcept.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
