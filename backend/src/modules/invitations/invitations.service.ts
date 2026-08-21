import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const SHORT_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: { schoolId: bigint; email?: string; role?: 'teacher' | 'school_admin'; parentId?: bigint },
    invitedBy: bigint,
  ) {
    const school = await this.prisma.school.findUnique({ where: { id: data.schoolId }, select: { name: true } });
    if (!school) throw new NotFoundException('Colegio no encontrado');

    let roleId: number;
    let roleName: string;
    if (data.parentId) {
      const parentRole = await this.prisma.role.findUnique({ where: { name: 'parent' }, select: { id: true, name: true } });
      if (!parentRole) throw new BadRequestException('El rol "parent" no está configurado');
      roleId = parentRole.id;
      roleName = parentRole.name;

      if (!data.email) {
        throw new BadRequestException('El email es obligatorio para invitar a un padre');
      }
      const parent = await this.prisma.parent.findUnique({ where: { id: data.parentId } });
      if (!parent) throw new NotFoundException('Padre no encontrado');
      if (parent.schoolId !== data.schoolId) {
        throw new BadRequestException('El padre no pertenece a este colegio');
      }
      if (parent.userId !== null) {
        throw new ConflictException('Este padre ya tiene una cuenta vinculada');
      }
    } else {
      if (!data.role) {
        throw new BadRequestException('role es obligatorio para invitaciones genéricas');
      }
      if (!data.email) {
        throw new BadRequestException('El email es obligatorio para esta invitación');
      }
      const role = await this.prisma.role.findUnique({ where: { name: data.role }, select: { id: true, name: true } });
      if (!role) throw new BadRequestException(`El rol "${data.role}" no está configurado`);
      roleId = role.id;
      roleName = role.name;
    }

    const existing = await this.prisma.schoolInvitation.findFirst({
      where: data.parentId
        ? { parentId: data.parentId, usedAt: null, expiresAt: { gt: new Date() } }
        : { schoolId: data.schoolId, email: data.email, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      throw new ConflictException(
        data.parentId
          ? 'Ya existe una invitación activa para este padre'
          : 'Ya existe una invitación activa para este email en este colegio',
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const shortCode = await this._generateUniqueShortCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await this.prisma.schoolInvitation.create({
      data: {
        schoolId: data.schoolId,
        email: data.email ?? null,
        roleId,
        token,
        shortCode,
        invitedBy,
        parentId: data.parentId ?? null,
        expiresAt,
      },
    });

    return {
      email: data.email ?? null,
      role: roleName,
      school: school.name,
      token,
      shortCode,
      expiresAt,
      // El cliente Flutter abre este deep link al recibirlo por email/WhatsApp
      // (todavía sin usar por ningún flujo real — ver nota en el modelo).
      inviteLink: `kolexa://register?token=${token}`,
    };
  }

  private async _generateUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < SHORT_CODE_MAX_ATTEMPTS; attempt++) {
      const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const clash = await this.prisma.schoolInvitation.findFirst({
        where: { shortCode: candidate, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new ConflictException('No se pudo generar un código único, intenta de nuevo');
  }

  async validate(code: string) {
    const inv = await this.prisma.schoolInvitation.findFirst({
      where: { OR: [{ token: code }, { shortCode: code }] },
      include: {
        school: { select: { name: true, logoUrl: true } },
        role: { select: { name: true } },
      },
    });

    if (!inv) throw new NotFoundException('Invitación no encontrada');
    if (inv.usedAt) throw new BadRequestException('Esta invitación ya fue utilizada');
    if (inv.expiresAt < new Date()) throw new BadRequestException('Esta invitación ha expirado');

    return {
      email: inv.email,
      school: { name: inv.school.name, logoUrl: inv.school.logoUrl },
      role: inv.role.name,
      expiresAt: inv.expiresAt,
    };
  }

  async findActiveForParent(schoolId: bigint, parentId: bigint) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, schoolId },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Padre no encontrado');

    return this.prisma.schoolInvitation.findFirst({
      where: { parentId, schoolId, usedAt: null, expiresAt: { gt: new Date() } },
      select: { token: true, shortCode: true, expiresAt: true, email: true },
    });
  }

  async findActiveForUser(schoolId: bigint, userId: bigint) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, userRoles: { some: { schoolId } } },
      select: { email: true },
    });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.schoolInvitation.findFirst({
      where: {
        email: targetUser.email,
        schoolId,
        parentId: null,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { token: true, shortCode: true, expiresAt: true, email: true },
    });
  }
}
